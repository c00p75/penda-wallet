import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/src/lib/supabase';
import type { ChatResponse, ConfirmActionResponse } from '@/src/api/types';

async function unwrapFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: unknown; message?: unknown };
      const message = typeof body.error === 'string' ? body.error : body.message;
      if (typeof message === 'string' && message) return new Error(message);
    } catch {
      /* body wasn't JSON */
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

export async function transcribeVoice(uri: string, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append('audio', {
    uri,
    name: filename,
    type: 'audio/m4a',
  } as unknown as Blob);

  const { data, error } = await supabase.functions.invoke<{ transcript: string }>('transcribe-voice', {
    body: formData,
  });

  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('Empty response from transcribe-voice function');
  return data.transcript;
}

export async function sendChatMessage(
  walletId: string,
  message: string,
  conversationId?: string,
): Promise<ChatResponse> {
  const { data, error } = await supabase.functions.invoke<ChatResponse>('chat-message', {
    body: { walletId, message, conversationId },
  });

  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('Empty response from chat-message function');
  return data;
}

export interface ChatStreamHandlers {
  onMeta?: (payload: { conversationId: string }) => void;
  onToken?: (payload: { text: string }) => void;
  onReset?: () => void;
  onDone: (payload: ChatResponse) => void;
  onError?: (payload: { error: string }) => void;
}

export async function sendChatMessageStream(
  walletId: string,
  message: string,
  conversationId: string | undefined,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Missing Supabase env for chat stream');

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Not signed in');

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
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    let errText = `Chat stream failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (typeof body.error === 'string' && body.error) errText = body.error;
      else if (typeof body.message === 'string' && body.message) errText = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(errText);
  }

  if (!res.body) throw new Error('Chat stream returned an empty body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sawDone = false;
  let currentEvent = 'message';

  const dispatch = (event: string, dataRaw: string) => {
    let data: unknown;
    try {
      data = JSON.parse(dataRaw);
    } catch {
      return;
    }
    switch (event) {
      case 'meta': {
        const cid =
          data && typeof data === 'object' && typeof (data as { conversationId?: unknown }).conversationId === 'string'
            ? (data as { conversationId: string }).conversationId
            : null;
        if (cid) handlers.onMeta?.({ conversationId: cid });
        break;
      }
      case 'token': {
        const text =
          data && typeof data === 'object' && typeof (data as { text?: unknown }).text === 'string'
            ? (data as { text: string }).text
            : '';
        if (text) handlers.onToken?.({ text });
        break;
      }
      case 'reset':
        handlers.onReset?.();
        break;
      case 'done':
        sawDone = true;
        handlers.onDone(data as ChatResponse);
        break;
      case 'error': {
        const errorMsg =
          data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : 'Something went wrong.';
        handlers.onError?.({ error: errorMsg });
        sawDone = true;
        throw new Error(errorMsg);
      }
      default:
        break;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';

    for (const line of parts) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim() || 'message';
        continue;
      }
      if (line.startsWith('data:')) {
        dispatch(currentEvent, line.slice(5).trim());
        currentEvent = 'message';
        continue;
      }
      if (line === '') {
        currentEvent = 'message';
      }
    }
  }

  if (!sawDone) {
    throw new Error('Chat stream ended before the reply finished.');
  }
}

export async function confirmAiAction(
  actionId: string,
  decision: 'confirm' | 'cancel',
): Promise<ConfirmActionResponse> {
  const { data, error } = await supabase.functions.invoke<ConfirmActionResponse>('confirm-ai-action', {
    body: { actionId, decision },
  });

  if (error) throw await unwrapFunctionError(error);
  if (!data) throw new Error('Empty response from confirm-ai-action function');
  return data;
}
