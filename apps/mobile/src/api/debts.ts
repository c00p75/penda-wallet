import { supabase } from '@/src/lib/supabase';
import type { Debt } from '@/src/api/types';

export async function fetchDebts(walletId: string): Promise<Debt[]> {
  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('wallet_id', walletId)
    .order('created_at');

  if (error) throw error;
  return data as Debt[];
}
