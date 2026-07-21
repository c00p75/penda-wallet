import { supabase } from '@/lib/supabase/client'
import { resolveFxFields } from '@/features/fx/api'
import type { ApplyMoneyHabitsResult } from '@/features/habits/moneyHabits'
import type { ReceiptItemsConfirmInput, Transaction, TransactionInput } from './types'

const SELECT_WITH_CATEGORY = '*, category:categories(id, name, icon, color)'

export class ConflictError extends Error {
  constructor() {
    super('Someone else already updated this transaction. It has been refreshed with their changes.')
    this.name = 'ConflictError'
  }
}

async function withFx(walletId: string, input: TransactionInput) {
  const { data: wallet, error } = await supabase
    .from('wallets')
    .select('base_currency')
    .eq('id', walletId)
    .single()
  if (error) throw error
  const fx = await resolveFxFields({
    amountMinor: input.amount_minor,
    currency: input.currency,
    walletBaseCurrency: wallet.base_currency,
  })
  return { ...input, ...fx }
}

export async function fetchTransactions(walletId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('wallet_id', walletId)
    .eq('user_confirmed', true)
    .is('deleted_at', null)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as unknown as Transaction[]
}

export async function fetchTransaction(id: string): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return (data as unknown as Transaction | null) ?? null
}

export async function createTransaction(
  walletId: string,
  userId: string,
  input: TransactionInput,
): Promise<Transaction> {
  const row = await withFx(walletId, input)
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      wallet_id: walletId,
      created_by: userId,
      ...row,
      source: input.source ?? 'manual',
    })
    .select(SELECT_WITH_CATEGORY)
    .single()

  if (error) throw error
  const tx = data as unknown as Transaction
  const habits = await applyMoneyHabitsSafe(tx.id)
  return Object.assign(tx, { habits }) as Transaction & { habits: ApplyMoneyHabitsResult | null }
}

/** Best-effort round-up / PYF; never fails the parent write. */
export async function applyMoneyHabitsSafe(
  transactionId: string,
): Promise<ApplyMoneyHabitsResult | null> {
  try {
    const { data, error } = await supabase.rpc('apply_money_habits', {
      p_transaction_id: transactionId,
    })
    if (error) return null
    return data as ApplyMoneyHabitsResult
  } catch {
    return null
  }
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
  expectedVersion: number,
): Promise<Transaction> {
  const { data: existing, error: loadError } = await supabase
    .from('transactions')
    .select('wallet_id')
    .eq('id', id)
    .single()
  if (loadError) throw loadError

  const row = await withFx(existing.wallet_id, input)
  const { data, error } = await supabase
    .from('transactions')
    .update({ ...row, user_confirmed: true, version: expectedVersion + 1 })
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(SELECT_WITH_CATEGORY)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new ConflictError()
  return data as unknown as Transaction
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

/**
 * Confirm a receipt draft as separate ledger rows (one per line item).
 * Reuses the draft for the first item; inserts the rest as confirmed siblings
 * sharing the same receipt image.
 */
export async function confirmReceiptAsItems(
  draft: Transaction,
  userId: string,
  input: ReceiptItemsConfirmInput,
): Promise<void> {
  if (input.items.length === 0) throw new Error('Add at least one item.')

  const [first, ...rest] = input.items
  await updateTransaction(
    draft.id,
    {
      type: input.type,
      amount_minor: first.amount_minor,
      currency: input.currency,
      category_id: first.category_id,
      merchant: input.merchant,
      description: first.description,
      transaction_date: input.transaction_date,
      source: 'receipt',
    },
    draft.version,
  )
  await applyMoneyHabitsSafe(draft.id)

  if (rest.length === 0) return

  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert(
      rest.map((item) => ({
        wallet_id: draft.wallet_id,
        created_by: userId,
        category_id: item.category_id,
        amount_minor: item.amount_minor,
        currency: input.currency,
        type: input.type,
        merchant: input.merchant,
        description: item.description,
        transaction_date: input.transaction_date,
        source: 'receipt',
        receipt_storage_path: draft.receipt_storage_path,
        ai_extraction: draft.ai_extraction,
        user_confirmed: true,
      })),
    )
    .select('id')

  if (error) throw error
  for (const row of inserted ?? []) {
    await applyMoneyHabitsSafe(row.id)
  }
}
