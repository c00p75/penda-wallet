import { supabase } from '@/lib/supabase/client'
import type { ChatResponse } from './types'

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
