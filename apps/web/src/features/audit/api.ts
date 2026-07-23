import { supabase } from '@/lib/supabase/client'

import { DEFAULT_AI_CONSENT, type AiConsent, type AiTrust } from '@/features/profile/types'
import {
  consentAfterUndo,
  normalizeAiTrust,
  withUndo,
} from './aiTrustLogic'
import {
  DOMAIN_TABLES,
  buildReinsertRow,
  canUndoAiAction as canUndoAiActionPure,
  filterRestorePatch,
  isUndoDomain,
} from './undoLogic'

export type AiPendingActionStatus = 'pending' | 'confirmed' | 'cancelled' | 'auto_applied'
export type AiPendingActionKind = 'update' | 'delete' | 'reconcile'

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

export { canUndoAiActionPure as canUndoAiAction }

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

async function revokeTrust(userId: string): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_consent, ai_trust')
    .eq('id', userId)
    .maybeSingle()

  const consent: AiConsent = consentAfterUndo({
    ...DEFAULT_AI_CONSENT,
    ...((profile?.ai_consent as object) ?? {}),
  } as AiConsent)
  const trust: AiTrust = withUndo(normalizeAiTrust(profile?.ai_trust))

  await supabase.from('profiles').update({ ai_consent: consent, ai_trust: trust }).eq('id', userId)
}

export async function fetchAiPendingAction(id: string): Promise<AiPendingAction | null> {
  const { data, error } = await supabase.from('ai_pending_actions').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** Undo a soft-deleted transaction after a confirmed AI delete; revokes graduated trust. */
export async function undoSoftDeletedTransaction(
  transactionId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: null })
    .eq('id', transactionId)

  if (error) throw error
  await revokeTrust(userId)
}

/** Soft-delete a transaction that was just created in chat (create undo). */
export async function softDeleteCreatedTransaction(
  transactionId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', transactionId)
    .is('deleted_at', null)

  if (error) throw error
  await revokeTrust(userId)
}

/** Remove a budget/goal/debt/category created in chat. */
export async function undoCreatedEntity(
  domain: string,
  targetId: string,
  userId: string,
): Promise<void> {
  if (domain === 'transaction') {
    await softDeleteCreatedTransaction(targetId, userId)
    return
  }
  if (!isUndoDomain(domain)) throw new Error(`Unknown domain "${domain}".`)
  const cfg = DOMAIN_TABLES[domain]
  const { error } = await supabase.from(cfg.table).delete().eq('id', targetId)
  if (error) throw error
  await revokeTrust(userId)
}

/**
 * Undo a confirmed/auto-applied AI action using the `__before` snapshot in patch
 * (updates) or soft-delete restore / hard-delete reinsert (deletes).
 */
export async function undoAiAction(action: AiPendingAction, userId: string): Promise<void> {
  if (!canUndoAiActionPure(action)) {
    throw new Error("This action can't be undone.")
  }

  // Reconcile (set_balance) undo = soft-delete the adjustment transaction it
  // created; not a generic CRUD domain so it skips the isUndoDomain check below.
  if (action.kind === 'reconcile') {
    await softDeleteCreatedTransaction(action.target_id, userId)
    return
  }

  if (!isUndoDomain(action.domain)) {
    throw new Error(`Unknown domain "${action.domain}".`)
  }

  const cfg = DOMAIN_TABLES[action.domain]

  if (action.kind === 'delete' && cfg.softDelete) {
    await undoSoftDeletedTransaction(action.target_id, userId)
    return
  }

  const before = (action.patch?.__before ?? {}) as Record<string, unknown>

  if (action.kind === 'update') {
    const restore = filterRestorePatch(action.domain, before)
    if (Object.keys(restore).length === 0) throw new Error('Nothing to restore.')
    const { error } = await supabase.from(cfg.table).update(restore).eq('id', action.target_id)
    if (error) throw error
  } else if (cfg.softDelete) {
    const { error } = await supabase
      .from(cfg.table)
      .update({ deleted_at: null })
      .eq('id', action.target_id)
    if (error) throw error
  } else {
    const row = buildReinsertRow(action.domain, action.target_id, before)
    const { error } = await supabase.from(cfg.table).insert(row)
    if (error) throw error
  }

  await revokeTrust(userId)
}
