import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { computeWalletBalanceMinor } from './walletBalance.ts'

/** Allowlists kept in sync with chat-message CRUD_DOMAINS / confirm-ai-action. */
export const DOMAIN_TABLES: Record<
  string,
  { table: string; softDelete: boolean; deletable: boolean; columns: string[] }
> = {
  transaction: {
    table: 'transactions',
    softDelete: true,
    deletable: true,
    columns: ['amount_minor', 'type', 'category_id', 'merchant', 'description', 'transaction_date'],
  },
  debt: {
    table: 'debts',
    softDelete: false,
    deletable: true,
    columns: ['name', 'direction', 'counterparty', 'principal_minor', 'due_date'],
  },
  budget: {
    table: 'budgets',
    softDelete: false,
    deletable: true,
    columns: ['amount_minor', 'period', 'category_id', 'rollover'],
  },
  goal: {
    table: 'savings_goals',
    softDelete: false,
    deletable: true,
    columns: ['name', 'target_amount_minor', 'current_amount_minor', 'target_date'],
  },
  category: { table: 'categories', softDelete: false, deletable: true, columns: ['name', 'icon'] },
  wallet: { table: 'wallets', softDelete: false, deletable: false, columns: ['name'] },
}

export interface PendingActionRow {
  id: string
  kind: 'update' | 'delete' | 'reconcile'
  domain: string
  target_id: string
  wallet_id: string
  user_id: string
  patch: Record<string, unknown> | null
  summary: string
  status: string
}

export async function executePendingAction(
  supabase: SupabaseClient,
  action: PendingActionRow,
): Promise<{ targetId?: string } | void> {
  if (action.kind === 'reconcile') {
    return await executeReconcile(supabase, action)
  }

  const target = DOMAIN_TABLES[action.domain]
  if (!target) throw new Error(`Unknown domain "${action.domain}".`)

  if (action.kind === 'update') {
    const patch = action.patch ?? {}
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([column]) => target.columns.includes(column)),
    )
    if (Object.keys(safePatch).length === 0) throw new Error('Nothing to update.')
    const { error } = await supabase.from(target.table).update(safePatch).eq('id', action.target_id)
    if (error) throw error
    return
  }

  if (!target.deletable) throw new Error(`Deleting a ${action.domain} isn't allowed.`)
  if (target.softDelete) {
    const { error } = await supabase
      .from(target.table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', action.target_id)
    if (error) throw error
  } else {
    const { error } = await supabase.from(target.table).delete().eq('id', action.target_id)
    if (error) throw error
  }
}

/**
 * Reconcile the wallet's computed total to the staged actual balance: post one
 * adjustment transaction for the gap (if any), and record the reconciliation.
 * Recomputes the balance live rather than trusting the stage-time snapshot,
 * since more transactions may have landed between staging and confirming.
 */
async function executeReconcile(
  supabase: SupabaseClient,
  action: PendingActionRow,
): Promise<{ targetId?: string }> {
  const amount = Number(action.patch?.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('A balance must be a number that is zero or more.')
  }
  const actualMinor = Math.round(amount * 100)

  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('currency')
    .eq('id', action.wallet_id)
    .single()
  if (walletError) throw walletError

  const computedMinor = await computeWalletBalanceMinor(supabase, action.wallet_id)
  const deltaMinor = actualMinor - computedMinor

  let targetId = action.target_id
  if (deltaMinor !== 0) {
    const { data: adjustment, error: adjError } = await supabase
      .from('transactions')
      .insert({
        wallet_id: action.wallet_id,
        created_by: action.user_id,
        category_id: null,
        amount_minor: Math.abs(deltaMinor),
        currency: wallet.currency,
        type: deltaMinor > 0 ? 'income' : 'expense',
        merchant: null,
        description: 'Balance reconciliation adjustment',
        transaction_date: new Date().toISOString().slice(0, 10),
        source: 'chat',
      })
      .select('id')
      .single()
    if (adjError) throw adjError
    targetId = adjustment.id
  }

  const { error: reconError } = await supabase.from('balance_reconciliations').insert({
    wallet_id: action.wallet_id,
    user_id: action.user_id,
    computed_balance_minor: computedMinor,
    actual_balance_minor: actualMinor,
    status: deltaMinor === 0 ? 'confirmed' : 'adjusted',
  })
  if (reconError) throw reconError

  const patch = { ...(action.patch ?? {}), __hasAdjustment: deltaMinor !== 0 }
  const { error: updateError } = await supabase
    .from('ai_pending_actions')
    .update({ target_id: targetId, patch })
    .eq('id', action.id)
  if (updateError) throw updateError

  return { targetId }
}
