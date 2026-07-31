import { supabase } from '@/src/lib/supabase';

export interface Account {
  id: string;
  wallet_id: string;
  name: string;
  kind_id: string | null;
  icon: string | null;
  is_default: boolean;
  sort_order: number;
}

export async function fetchAccounts(walletId: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, wallet_id, name, kind_id, icon, is_default, sort_order')
    .eq('wallet_id', walletId)
    .is('archived_at', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Account[];
}

export async function createAccount(
  walletId: string,
  input: { name: string; kind_id: string | null; icon?: string | null },
): Promise<Account> {
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      wallet_id: walletId,
      name: input.name.trim(),
      kind_id: input.kind_id,
      icon: input.icon ?? null,
      is_default: false,
    })
    .select('id, wallet_id, name, kind_id, icon, is_default, sort_order')
    .single();
  if (error) throw error;
  return data as Account;
}

export interface PocketType {
  id: string;
  wallet_id: string;
  name: string;
  icon: string | null;
}

export async function fetchPocketTypes(walletId: string): Promise<PocketType[]> {
  const { data, error } = await supabase
    .from('account_kinds')
    .select('id, wallet_id, name, icon')
    .eq('wallet_id', walletId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PocketType[];
}
