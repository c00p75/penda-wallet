import { supabase } from '@/src/lib/supabase';
import type { RecurringTransaction } from '@/src/api/types';

export async function fetchRecurringTransactions(walletId: string): Promise<RecurringTransaction[]> {
  const { data, error } = await supabase
    .from('recurring_transactions')
    .select('*')
    .eq('wallet_id', walletId)
    .order('next_run_date');

  if (error) throw error;
  return data as unknown as RecurringTransaction[];
}
