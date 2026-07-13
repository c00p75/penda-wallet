export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
}

export interface ChatResponse {
  conversationId: string
  reply: string
  transaction: Record<string, unknown> | null
}
