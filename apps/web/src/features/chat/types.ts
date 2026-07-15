export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Staged update/delete cards the user must confirm before they take effect. */
  pendingActions?: PendingAction[]
}

/** An edit or deletion the agent proposed; it is applied only if the user confirms. */
export interface PendingAction {
  id: string
  kind: 'update' | 'delete'
  domain: string
  summary: string
}

export interface ChatResponse {
  conversationId: string
  reply: string
  transaction: Record<string, unknown> | null
  pendingActions?: PendingAction[]
}

export interface ConfirmActionResponse {
  ok: boolean
  status: 'confirmed' | 'cancelled'
  domain: string
  summary: string
}
