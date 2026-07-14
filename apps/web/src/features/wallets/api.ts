import { supabase } from '@/lib/supabase/client'
import type { Wallet, WalletMember, WalletRole } from './types'

export async function fetchWallets(userId: string): Promise<Wallet[]> {
  const { data, error } = await supabase
    .from('wallet_members')
    .select('joined_at, wallets(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => row.wallets as unknown as Wallet)
}

async function createDefaultWallet(): Promise<Wallet> {
  const { data, error } = await supabase
    .rpc('create_wallet_with_owner', { p_name: 'My Wallet', p_base_currency: 'USD' })
    .single()

  if (error) throw error
  return data as Wallet
}

export async function fetchOrCreateWallets(userId: string): Promise<Wallet[]> {
  const existing = await fetchWallets(userId)
  if (existing.length > 0) return existing
  return [await createDefaultWallet()]
}

export async function createWallet(name: string, baseCurrency: string): Promise<Wallet> {
  const { data, error } = await supabase
    .rpc('create_wallet_with_owner', { p_name: name, p_base_currency: baseCurrency })
    .single()

  if (error) throw error
  return data as Wallet
}

export async function updateWallet(
  id: string,
  input: { name: string; baseCurrency: string },
): Promise<Wallet> {
  const { data, error } = await supabase
    .from('wallets')
    .update({ name: input.name, base_currency: input.baseCurrency })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as Wallet
}

export async function fetchWalletMembers(walletId: string): Promise<WalletMember[]> {
  const { data, error } = await supabase.rpc('get_wallet_members', { p_wallet_id: walletId })
  if (error) throw error
  return data as WalletMember[]
}

export async function inviteWalletMember(walletId: string, email: string, role: WalletRole): Promise<void> {
  const { error } = await supabase.rpc('invite_wallet_member', {
    p_wallet_id: walletId,
    p_email: email,
    p_role: role,
  })
  if (error) throw error
}

export async function removeWalletMember(walletId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('wallet_members')
    .delete()
    .eq('wallet_id', walletId)
    .eq('user_id', userId)
  if (error) throw error
}
