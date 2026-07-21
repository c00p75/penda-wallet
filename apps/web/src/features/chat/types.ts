/** Something applied in chat that the user can reverse from the trail footer. */
export type ChatUndoTarget =
  | { type: 'pending_action'; actionId: string }
  | { type: 'soft_delete_transaction'; transactionId: string }
  | { type: 'restore_soft_deleted_transaction'; transactionId: string }
  | { type: 'delete_created'; domain: string; targetId: string }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Staged update/delete, also rendered inside the action trail. */
  pendingActions?: PendingAction[]
  /** Durable trail of tools that ran for this turn (creates, lookups, etc.). */
  actions?: ChatAction[]
  /** Set on a failed-send error bubble; the original text a Retry button resends. */
  retryText?: string
  /** Offline queue marker, sends when back online. */
  queued?: boolean
  /** After confirm: deep-link to the entity, or its list after a delete. */
  viewHref?: string
  /**
   * @deprecated Prefer undoTargets. Kept so older persisted threads still show Undo
   * for confirmed transaction deletes.
   */
  undoTransactionId?: string
  /** Applied creates / auto-applied or confirmed mutations reversible from this bubble. */
  undoTargets?: ChatUndoTarget[]
  /** True when the turn auto-applied under graduated trust. */
  autoApplied?: boolean
}

/** An edit or deletion the agent proposed; it is applied only if the user confirms. */
export interface PendingAction {
  id: string
  kind: 'update' | 'delete'
  domain: string
  summary: string
  targetId?: string
}

/** A single tool step shown in the chat action trail (live or persisted). */
export interface ChatAction {
  id: string
  tool: string
  domain: string
  label: string
  summary: string
  status: 'running' | 'done' | 'error' | 'pending' | 'confirmed' | 'cancelled'
  targetId?: string
  viewHref?: string
  /** For pending update/delete rows. */
  pendingKind?: 'update' | 'delete'
  /** Optional key/value rows shown when the step is expanded. */
  details?: Record<string, string>
}

export interface ChatResponse {
  conversationId: string
  reply: string
  transaction: Record<string, unknown> | null
  pendingActions?: PendingAction[]
  /** Tools that completed during this turn. */
  actions?: ChatAction[]
  /** True when at least one update/delete was auto-applied via trust. */
  autoApplied?: boolean
}

export interface ConfirmActionResponse {
  ok: boolean
  status: 'confirmed' | 'cancelled'
  domain: string
  summary: string
  targetId?: string
  kind?: 'update' | 'delete'
}
