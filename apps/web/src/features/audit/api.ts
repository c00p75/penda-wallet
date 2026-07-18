import { supabase } from '@/lib/supabase/client'

export type AiPendingActionStatus = 'pending' | 'confirmed' | 'cancelled'
export type AiPendingActionKind = 'update' | 'delete'

export interface AiPendingAction {
  id: string
  user_id: string
  wallet_id: string
  conversation_id: string | null
  kind: AiPendingActionKind
  domain: string
  target_id: string
  patch: Record<string, unknown> | null
  summary: string
  status: AiPendingActionStatus
  created_at: string
  resolved_at: string | null
}

export async function fetchAiPendingActions(userId: string): Promise<AiPendingAction[]> {
  const { data, error } = await supabase
    .from('ai_pending_actions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return data
}

/** Undo a soft-deleted transaction after a confirmed AI delete. */
export async function undoSoftDeletedTransaction(transactionId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: null })
    .eq('id', transactionId)

  if (error) throw error
}
