import { supabase } from '@/lib/supabase/client'
import type { Transaction, TransactionInput } from './types'

const SELECT_WITH_CATEGORY = '*, category:categories(id, name, icon, color)'

export async function fetchTransactions(walletId: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(SELECT_WITH_CATEGORY)
    .eq('wallet_id', walletId)
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
      source: 'manual',
      ...input,
    })
    .select(SELECT_WITH_CATEGORY)
    .single()

  if (error) throw error
  return data as unknown as Transaction
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .update(input)
    .eq('id', id)
    .select(SELECT_WITH_CATEGORY)
    .single()

  if (error) throw error
  return data as unknown as Transaction
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}
