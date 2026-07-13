import { supabase } from '@/lib/supabase/client'
import type { Wallet } from './types'

async function fetchFirstWallet(userId: string): Promise<Wallet | null> {
  const { data, error } = await supabase
    .from('wallet_members')
    .select('wallets(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data?.wallets as unknown as Wallet) ?? null
}

async function createDefaultWallet(): Promise<Wallet> {
  const { data, error } = await supabase
    .rpc('create_wallet_with_owner', { p_name: 'My Wallet', p_base_currency: 'USD' })
    .single()

  if (error) throw error
  return data as Wallet
}

export async function fetchOrCreateDefaultWallet(userId: string): Promise<Wallet> {
  const existing = await fetchFirstWallet(userId)
  if (existing) return existing
  return createDefaultWallet()
}
