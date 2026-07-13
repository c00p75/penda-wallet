import { supabase } from '@/lib/supabase/client'
import type { RecurringInput, RecurringTransaction } from './types'

export async function fetchRecurringTransactions(walletId: string): Promise<RecurringTransaction[]> {
  const { data, error } = await supabase
    .from('recurring_transactions')
    .select('*')
    .eq('wallet_id', walletId)
    .order('next_run_date')

  if (error) throw error
  return data as unknown as RecurringTransaction[]
}

export async function createRecurringTransaction(
  walletId: string,
  userId: string,
  input: RecurringInput,
): Promise<RecurringTransaction> {
  const { data, error } = await supabase
    .from('recurring_transactions')
    .insert({ wallet_id: walletId, created_by: userId, ...input })
    .select('*')
    .single()

  if (error) throw error
  return data as unknown as RecurringTransaction
}

export async function updateRecurringTransaction(
  id: string,
  input: RecurringInput,
): Promise<RecurringTransaction> {
  const { data, error } = await supabase
    .from('recurring_transactions')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as unknown as RecurringTransaction
}

export async function setRecurringActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('recurring_transactions')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) throw error
}

export async function deleteRecurringTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('recurring_transactions').delete().eq('id', id)
  if (error) throw error
}
