import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import type { PageContext } from './pageContext'
import type { ChatResponse, ConfirmActionResponse } from './types'

// supabase.functions.invoke surfaces every non-2xx as a FunctionsHttpError
// whose .message is just "Edge Function returned a non-2xx status code" — the
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
      /* body wasn't JSON — fall through to the original error */
    }
  }
  return error instanceof Error ? error : new Error(String(error))
}

export async function transcribeVoice(audio: Blob, filename: string): Promise<string> {
  const formData = new FormData()
  formData.append('audio', audio, filename)

  const { data, error } = await supabase.functions.invoke<{ transcript: string }>('transcribe-voice', {
    body: formData,
  })

  if (error) throw await unwrapFunctionError(error)
  if (!data) throw new Error('Empty response from transcribe-voice function')
  return data.transcript
}

export async function sendChatMessage(
  walletId: string,
  message: string,
  conversationId?: string,
  pageContext?: PageContext,
): Promise<ChatResponse> {
  const { data, error } = await supabase.functions.invoke<ChatResponse>('chat-message', {
    body: { walletId, message, conversationId, pageContext },
  })

  if (error) throw await unwrapFunctionError(error)
  if (!data) throw new Error('Empty response from chat-message function')
  return data
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
