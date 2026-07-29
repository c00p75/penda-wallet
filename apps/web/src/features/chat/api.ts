import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import type { PageContext } from './pageContext'
import type { ChatConversationSummary, ChatMessage, ChatResponse, ConfirmActionResponse } from './types'
import type { UiEdit } from './uiEdits'

// supabase.functions.invoke surfaces every non-2xx as a FunctionsHttpError
// whose .message is just "Edge Function returned a non-2xx status code", the
// server's actual user-facing copy (the rate-limit 429 message, premium 402s,
// validation 400s) sits unread in the response body. Unwrap it so the UI
// shows what the server said instead of the generic wrapper line.
async function unwrapFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: unknown; message?: unknown }
      const message = typeof body.error === 'string' ? body.error : body.message
      if (typeof message === 'string' && message) return new Error(message)
    } catch {
      /* body wasn't JSON, fall through to the original error */
    }
  }
  return error instanceof Error ? error : new Error(String(error))
}

export interface TranscribeVoiceOptions {
  currency?: string
  locale?: string
  signal?: AbortSignal
}

export async function transcribeVoice(
  audio: Blob,
  filename: string,
  opts?: TranscribeVoiceOptions,
): Promise<string> {
  const formData = new FormData()
  formData.append('audio', audio, filename)
  if (opts?.currency) formData.append('currency', opts.currency)
  if (opts?.locale) formData.append('locale', opts.locale)

  if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const { data, error } = await supabase.functions.invoke<{ transcript: string }>('transcribe-voice', {
    body: formData,
  })

  if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (error) throw await unwrapFunctionError(error)
  if (!data) throw new Error('Empty response from transcribe-voice function')
  return data.transcript
}

export async function sendChatMessage(
  walletId: string,
  message: string,
  conversationId?: string,
  pageContext?: PageContext,
  uiEdits?: UiEdit[],
): Promise<ChatResponse> {
  const { data, error } = await supabase.functions.invoke<ChatResponse>('chat-message', {
    body: { walletId, message, conversationId, pageContext, uiEdits },
  })

  if (error) throw await unwrapFunctionError(error)
  if (!data) throw new Error('Empty response from chat-message function')
  return data
}

export interface ChatStreamHandlers {
  onMeta?: (payload: { conversationId: string }) => void
  onToken?: (payload: { text: string }) => void
  onReset?: () => void
  onDone: (payload: ChatResponse) => void
  onError?: (payload: { error: string }) => void
}

/**
 * SSE token stream over raw fetch (functions.invoke buffers the body).
 * Falls back is the caller's responsibility when this throws before onDone.
 */
export async function sendChatMessageStream(
  walletId: string,
  message: string,
  conversationId: string | undefined,
  pageContext: PageContext | undefined,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
  uiEdits?: UiEdit[],
): Promise<void> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Missing Supabase env for chat stream')

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('Not signed in')

  const res = await fetch(`${url}/functions/v1/chat-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      walletId,
      message,
      conversationId,
      pageContext,
      uiEdits,
      stream: true,
    }),
    signal,
  })

  if (!res.ok) {
    let errText = `Chat stream failed (${res.status})`
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      if (typeof body.error === 'string' && body.error) errText = body.error
      else if (typeof body.message === 'string' && body.message) errText = body.message
    } catch {
      /* ignore */
    }
    throw new Error(errText)
  }

  if (!res.body) throw new Error('Chat stream returned an empty body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sawDone = false
  let currentEvent = 'message'

  const dispatch = (event: string, dataRaw: string) => {
    let data: unknown
    try {
      data = JSON.parse(dataRaw)
    } catch {
      return
    }
    switch (event) {
      case 'meta': {
        const conversationId =
          data && typeof data === 'object' && typeof (data as { conversationId?: unknown }).conversationId === 'string'
            ? (data as { conversationId: string }).conversationId
            : null
        if (conversationId) handlers.onMeta?.({ conversationId })
        break
      }
      case 'token': {
        const text =
          data && typeof data === 'object' && typeof (data as { text?: unknown }).text === 'string'
            ? (data as { text: string }).text
            : ''
        if (text) handlers.onToken?.({ text })
        break
      }
      case 'reset':
        handlers.onReset?.()
        break
      case 'done':
        sawDone = true
        handlers.onDone(data as ChatResponse)
        break
      case 'error': {
        const error =
          data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : 'Something went wrong.'
        handlers.onError?.({ error })
        // Mark finished so the reader loop doesn't also throw "ended before done".
        sawDone = true
        throw new Error(error)
      }
      default:
        break
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''

    for (const line of parts) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim() || 'message'
        continue
      }
      if (line.startsWith('data:')) {
        dispatch(currentEvent, line.slice(5).trim())
        currentEvent = 'message'
        continue
      }
      if (line === '') {
        currentEvent = 'message'
      }
    }
  }

  if (!sawDone) {
    throw new Error('Chat stream ended before the reply finished.')
  }
}

export async function confirmAiAction(
  actionId: string,
  decision: 'confirm' | 'cancel',
): Promise<ConfirmActionResponse> {
  const { data, error } = await supabase.functions.invoke<ConfirmActionResponse>('confirm-ai-action', {
    body: { actionId, decision },
  })

  if (error) throw await unwrapFunctionError(error)
  if (!data) throw new Error('Empty response from confirm-ai-action function')
  return data
}

// Provider-agnostic message content, mirrors the edge function's NeutralPart
// (only the `text` shape matters to the client, tool calls/results render nothing).
type StoredPart = { type: string; text?: string }

function joinTextParts(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return (content as StoredPart[])
    .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text!.trim())
    .filter(Boolean)
    .join('\n\n')
}

const CHAT_HISTORY_LIMIT = 30

export async function fetchChatConversations(
  userId: string,
  walletId: string,
): Promise<ChatConversationSummary[]> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('id, created_at, chat_messages(content)')
    .eq('user_id', userId)
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: true, foreignTable: 'chat_messages' })
    .limit(1, { foreignTable: 'chat_messages' })
    .order('created_at', { ascending: false })
    .limit(CHAT_HISTORY_LIMIT)

  if (error) throw error

  return (data ?? [])
    .map((row) => {
      const first = (row.chat_messages as Array<{ content: unknown }> | null)?.[0]
      return {
        id: row.id as string,
        createdAt: row.created_at as string,
        preview: joinTextParts(first?.content),
      }
    })
    .filter((c) => c.preview)
}

export async function fetchChatConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? [])
    .map((row) => ({
      id: row.id as string,
      role: row.role as 'user' | 'assistant',
      text: joinTextParts(row.content),
    }))
    // Tool-call/tool-result turns carry no text part, drop them from the transcript.
    .filter((m) => m.text)
}
