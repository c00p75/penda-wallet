import { supabase } from '@/lib/supabase/client'

import { DEFAULT_AI_CONSENT, DEFAULT_AI_TRUST, type AiConsent, type AiTrust } from '@/features/profile/types'

export type AiPendingActionStatus = 'pending' | 'confirmed' | 'cancelled' | 'auto_applied'
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

/** Domains and tables mirrored from executePendingAction. */
const DOMAIN_TABLES: Record<
  string,
  { table: string; softDelete: boolean; columns: string[] }
> = {
  transaction: {
    table: 'transactions',
    softDelete: true,
    columns: ['amount_minor', 'type', 'category_id', 'merchant', 'description', 'transaction_date'],
  },
  debt: {
    table: 'debts',
    softDelete: false,
    columns: ['name', 'direction', 'counterparty', 'principal_minor', 'due_date', 'balance_minor', 'wallet_id'],
  },
  budget: {
    table: 'budgets',
    softDelete: false,
    columns: ['amount_minor', 'period', 'category_id', 'rollover', 'wallet_id'],
  },
  goal: {
    table: 'savings_goals',
    softDelete: false,
    columns: ['name', 'target_amount_minor', 'current_amount_minor', 'target_date', 'wallet_id'],
  },
  category: {
    table: 'categories',
    softDelete: false,
    columns: ['name', 'icon', 'wallet_id'],
  },
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

function normalizeTrust(raw: unknown): AiTrust {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AI_TRUST }
  const o = raw as Record<string, unknown>
  return {
    confirmed_ok: Math.max(0, Number(o.confirmed_ok) || 0),
    confirmed_undone: Math.max(0, Number(o.confirmed_undone) || 0),
    auto_loose: Boolean(o.auto_loose),
  }
}

async function revokeTrust(userId: string): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_consent, ai_trust')
    .eq('id', userId)
    .maybeSingle()

  const consent: AiConsent = {
    ...DEFAULT_AI_CONSENT,
    ...((profile?.ai_consent as object) ?? {}),
    act_without_confirm: false,
  }
  const trust = normalizeTrust(profile?.ai_trust)
  trust.confirmed_undone += 1
  trust.auto_loose = false

  await supabase.from('profiles').update({ ai_consent: consent, ai_trust: trust }).eq('id', userId)
}

/** Whether this resolved action can be undone from the AI actions page. */
export function canUndoAiAction(action: AiPendingAction): boolean {
  if (action.status !== 'confirmed' && action.status !== 'auto_applied') return false
  if (action.kind === 'delete' && action.domain === 'transaction') return true
  const before = action.patch?.__before
  return !!before && typeof before === 'object'
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

/**
 * Undo a confirmed/auto-applied AI action using the `__before` snapshot in patch
 * (updates) or soft-delete restore / hard-delete reinsert (deletes).
 */
export async function undoAiAction(action: AiPendingAction, userId: string): Promise<void> {
  if (!canUndoAiAction(action)) {
    throw new Error('This action can’t be undone.')
  }

  if (action.kind === 'delete' && action.domain === 'transaction') {
    await undoSoftDeletedTransaction(action.target_id, userId)
    return
  }

  const cfg = DOMAIN_TABLES[action.domain]
  if (!cfg) throw new Error(`Unknown domain "${action.domain}".`)
  const before = (action.patch?.__before ?? {}) as Record<string, unknown>

  if (action.kind === 'update') {
    const restore = Object.fromEntries(
      Object.entries(before).filter(([column]) => cfg.columns.includes(column)),
    )
    if (Object.keys(restore).length === 0) throw new Error('Nothing to restore.')
    const { error } = await supabase.from(cfg.table).update(restore).eq('id', action.target_id)
    if (error) throw error
  } else {
    // Hard-deleted row: reinsert from snapshot when possible.
    if (cfg.softDelete) {
      const { error } = await supabase
        .from(cfg.table)
        .update({ deleted_at: null })
        .eq('id', action.target_id)
      if (error) throw error
    } else {
      const row = { ...before, id: action.target_id }
      // Drop join/computed fields that aren't columns.
      delete row.category
      delete row.deleted_at
      const { error } = await supabase.from(cfg.table).insert(row)
      if (error) throw error
    }
  }

  await revokeTrust(userId)
}
