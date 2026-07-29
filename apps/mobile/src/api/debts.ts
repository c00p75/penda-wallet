import { supabase } from '@/src/lib/supabase';
import type { Debt, DebtPayment } from '@/src/api/types';

export async function fetchDebts(walletId: string): Promise<Debt[]> {
  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('wallet_id', walletId)
    .order('created_at');

  if (error) throw error;
  return data as Debt[];
}

/** The payment a linked pocket transaction posted, if it was one. Used to offer reversing it on delete. */
export async function fetchPaymentByTransactionId(
  transactionId: string,
): Promise<(DebtPayment & { debt: { name: string } | null }) | null> {
  const { data, error } = await supabase
    .from('debt_payments')
    .select('*, debt:debts(name)')
    .eq('transaction_id', transactionId)
    .maybeSingle();

  if (error) throw error;
  return data as (DebtPayment & { debt: { name: string } | null }) | null;
}

export async function deleteDebtPayment(id: string): Promise<void> {
  const { error } = await supabase.from('debt_payments').delete().eq('id', id);
  if (error) throw error;
}
