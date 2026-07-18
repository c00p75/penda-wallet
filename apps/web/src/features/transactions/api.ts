import { supabase } from '@/lib/supabase/client'
import type { ReceiptItemsConfirmInput, Transaction, TransactionInput } from './types'

const SELECT_WITH_CATEGORY = '*, category:categories(id, name, icon, color)'

export class ConflictError extends Error {
  constructor() {
    super('Someone else already updated this transaction. It has been refreshed with their changes.')
    this.name = 'ConflictError'
  }
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

export async function createTransaction(
  walletId: string,
  userId: string,
  input: TransactionInput,
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      wallet_id: walletId,
      created_by: userId,
      ...input,
      source: input.source ?? 'manual',
    })
    .select(SELECT_WITH_CATEGORY)
    .single()

  if (error) throw error
  return data as unknown as Transaction
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
  expectedVersion: number,
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .update({ ...input, user_confirmed: true, version: expectedVersion + 1 })
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

  if (rest.length === 0) return

  const { error } = await supabase.from('transactions').insert(
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
  if (error) throw error
}
