import { supabase } from '@/lib/supabase/client'
import type { ChatResponse } from './types'

export async function transcribeVoice(audio: Blob, filename: string): Promise<string> {
  const formData = new FormData()
  formData.append('audio', audio, filename)

  const { data, error } = await supabase.functions.invoke<{ transcript: string }>('transcribe-voice', {
    body: formData,
  })

  if (error) throw error
  if (!data) throw new Error('Empty response from transcribe-voice function')
  return data.transcript
}

export async function sendChatMessage(
  walletId: string,
  message: string,
  conversationId?: string,
): Promise<ChatResponse> {
  const { data, error } = await supabase.functions.invoke<ChatResponse>('chat-message', {
    body: { walletId, message, conversationId },
  })

  if (error) throw error
  if (!data) throw new Error('Empty response from chat-message function')
  return data
}
