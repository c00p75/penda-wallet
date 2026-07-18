import { supabase } from '@/src/lib/supabase';
import type { Transaction, TransactionInput } from '@/src/api/types';

const SELECT_WITH_CATEGORY = '*, category:categories(id, name, icon, color)';

export class ConflictError extends Error {
  constructor() {
    super('Someone else already updated this transaction.');
    this.name = 'ConflictError';
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
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as unknown as Transaction[];
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
      converted_amount_minor: input.amount_minor,
      fx_rate_to_wallet_base: 1,
      source: input.source ?? 'manual',
      user_confirmed: true,
    })
    .select(SELECT_WITH_CATEGORY)
    .single();

  if (error) throw error;
  return data as unknown as Transaction;
}

export async function updateTransaction(
  id: string,
  input: TransactionInput,
  expectedVersion: number,
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .update({
      ...input,
      converted_amount_minor: input.amount_minor,
      user_confirmed: true,
      version: expectedVersion + 1,
    })
    .eq('id', id)
    .eq('version', expectedVersion)
    .select(SELECT_WITH_CATEGORY)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new ConflictError();
  return data as unknown as Transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}
