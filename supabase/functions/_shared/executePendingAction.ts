import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { fetchBalanceAdjustmentCategoryId } from './balanceAdjustment.ts'
import { computeAccountBalanceMinor, computeWalletBalanceMinor } from './walletBalance.ts'

/** Allowlists kept in sync with chat-message CRUD_DOMAINS / confirm-ai-action. */
export const DOMAIN_TABLES: Record<
  string,
  {
    table: string
    softDelete: boolean
    deletable: boolean
    /** Columns executePendingAction may write on update. */
    columns: string[]
    /** Columns allowed when inserting a staged create (plus ownership keys in patch). */
    createColumns: string[]
  }
> = {
  transaction: {
    table: 'transactions',
    softDelete: true,
    deletable: true,
    columns: ['amount_minor', 'type', 'category_id', 'merchant', 'description', 'transaction_date'],
    createColumns: [
      'wallet_id',
      'created_by',
      'category_id',
      'amount_minor',
      'currency',
      'type',
      'merchant',
      'description',
      'transaction_date',
      'source',
    ],
  },
  debt: {
    table: 'debts',
    softDelete: false,
    deletable: true,
    columns: ['name', 'direction', 'counterparty', 'principal_minor', 'due_date'],
    createColumns: [
      'wallet_id',
      'name',
      'direction',
      'counterparty',
      'principal_minor',
      'balance_minor',
      'interest_rate',
      'due_date',
    ],
  },
  budget: {
    table: 'budgets',
    softDelete: false,
    deletable: true,
    columns: ['amount_minor', 'period', 'category_id', 'rollover', 'start_date', 'end_date'],
    createColumns: ['wallet_id', 'category_id', 'amount_minor', 'period', 'rollover', 'start_date', 'end_date'],
  },
  goal: {
    table: 'savings_goals',
    softDelete: false,
    deletable: true,
    columns: [
      'name',
      'target_amount_minor',
      'current_amount_minor',
      'target_date',
      'icon',
      'motivation',
    ],
    createColumns: [
      'wallet_id',
      'name',
      'target_amount_minor',
      'current_amount_minor',
      'target_date',
      'icon',
      'motivation',
    ],
  },
  category: {
    table: 'categories',
    softDelete: false,
    deletable: true,
    columns: ['name', 'icon'],
    createColumns: ['wallet_id', 'name', 'icon'],
  },
  wallet: {
    table: 'wallets',
    softDelete: false,
    deletable: false,
    columns: ['name'],
    createColumns: [],
  },
  recurring: {
    table: 'recurring_transactions',
    softDelete: false,
    deletable: true,
    columns: ['template', 'frequency', 'next_run_date', 'is_active'],
    createColumns: [
      'wallet_id',
      'created_by',
      'template',
      'frequency',
      'next_run_date',
      'is_active',
    ],
  },
  pact: {
    table: 'commitment_pacts',
    softDelete: false,
    deletable: true,
    columns: [
      'description',
      'category_id',
      'goal_id',
      'start_date',
      'end_date',
      'stake_kind',
      'stake_amount_minor',
      'stake_note',
    ],
    createColumns: [
      'wallet_id',
      'created_by',
      'description',
      'category_id',
      'goal_id',
      'start_date',
      'end_date',
      'stake_kind',
      'stake_amount_minor',
      'stake_note',
    ],
  },
}

export interface PendingActionRow {
  id: string
  kind: 'create' | 'update' | 'delete' | 'reconcile'
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

  if (action.kind === 'create') {
    return await executeCreate(supabase, action, target)
  }

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

async function executeCreate(
  supabase: SupabaseClient,
  action: PendingActionRow,
  target: (typeof DOMAIN_TABLES)[string],
): Promise<{ targetId: string }> {
  if (target.createColumns.length === 0) {
    throw new Error(`Creating a ${action.domain} isn't allowed.`)
  }
  const patch = action.patch ?? {}
  const safePatch = Object.fromEntries(
    Object.entries(patch).filter(
      ([column]) => target.createColumns.includes(column) && column !== '__before',
    ),
  )
  if (Object.keys(safePatch).length === 0) throw new Error('Nothing to create.')

  const { data, error } = await supabase.from(target.table).insert(safePatch).select('id').single()
  if (error) throw error

  const { error: updateError } = await supabase
    .from('ai_pending_actions')
    .update({ target_id: data.id })
    .eq('id', action.id)
  if (updateError) throw updateError

  return { targetId: data.id }
}

/**
 * Reconcile the wallet's computed total to the staged actual balance: post one
 * adjustment transaction for the gap (if any), and record the reconciliation.
 * Recomputes the balance live rather than trusting the stage-time snapshot,
 * since more transactions may have landed between staging and confirming.
 *
 * `patch.amount` is already in minor units (staged by set_balance).
 */
async function executeReconcile(
  supabase: SupabaseClient,
  action: PendingActionRow,
): Promise<{ targetId?: string }> {
  const amount = Number(action.patch?.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('A balance must be a number that is zero or more.')
  }
  // Staged as minor units already. Do not multiply by 100 again.
  const actualMinor = Math.round(amount)

  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('base_currency')
    .eq('id', action.wallet_id)
    .single()
  if (walletError) throw walletError

  const accountId =
    typeof action.patch?.account_id === 'string' ? (action.patch.account_id as string) : null
  const scopeWallet = action.patch?.scope_wallet === true || !accountId
  const computedMinor = scopeWallet
    ? await computeWalletBalanceMinor(supabase, action.wallet_id)
    : await computeAccountBalanceMinor(supabase, accountId!)
  const deltaMinor = actualMinor - computedMinor

  let targetId = action.target_id
  if (deltaMinor !== 0) {
    const categoryId = await fetchBalanceAdjustmentCategoryId(supabase)
    const { data: adjustment, error: adjError } = await supabase
      .from('transactions')
      .insert({
        wallet_id: action.wallet_id,
        created_by: action.user_id,
        account_id: accountId,
        category_id: categoryId,
        amount_minor: Math.abs(deltaMinor),
        currency: wallet.base_currency,
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
