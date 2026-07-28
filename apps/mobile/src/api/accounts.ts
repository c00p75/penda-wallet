import { supabase } from '@/src/lib/supabase';

export type AccountKind = 'cash' | 'mobile_money' | 'bank' | 'other';

export interface Account {
  id: string;
  wallet_id: string;
  name: string;
  kind: AccountKind;
  provider: string | null;
  icon: string | null;
  is_default: boolean;
  sort_order: number;
}

export async function fetchAccounts(walletId: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, wallet_id, name, kind, provider, icon, is_default, sort_order')
    .eq('wallet_id', walletId)
    .is('archived_at', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Account[];
}

export async function createAccount(
  walletId: string,
  input: { name: string; kind: AccountKind; provider?: string | null; icon?: string | null },
): Promise<Account> {
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      wallet_id: walletId,
      name: input.name.trim(),
      kind: input.kind,
      provider: input.provider ?? null,
      icon: input.icon ?? null,
      is_default: false,
    })
    .select('id, wallet_id, name, kind, provider, icon, is_default, sort_order')
    .single();
  if (error) throw error;
  return data as Account;
}
