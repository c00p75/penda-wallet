import { supabase } from '@/src/lib/supabase';
import type { Wallet, WalletMember } from '@/src/api/types';

export async function fetchWallets(userId: string): Promise<Wallet[]> {
  const { data, error } = await supabase
    .from('wallet_members')
    .select('joined_at, wallets(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => row.wallets as unknown as Wallet);
}

export async function createWallet(name: string, baseCurrency: string): Promise<Wallet> {
  const { data, error } = await supabase
    .rpc('create_wallet_with_owner', { p_name: name, p_base_currency: baseCurrency })
    .single();

  if (error) throw error;
  return data as Wallet;
}

export async function fetchWalletMembers(walletId: string): Promise<WalletMember[]> {
  const { data, error } = await supabase.rpc('get_wallet_members', { p_wallet_id: walletId });
  if (error) throw error;
  return data as WalletMember[];
}
