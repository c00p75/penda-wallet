import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import type { InviteRole, MyWalletInvite, Wallet, WalletInvite, WalletMember } from './types'

// supabase.functions.invoke surfaces every non-2xx as a FunctionsHttpError
// whose .message is just "Edge Function returned a non-2xx status code", the
// server's actual user-facing copy sits unread in the response body. Unwrap
// it so the UI shows what the server said instead of the generic wrapper line.
async function unwrapFunctionError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: unknown; message?: unknown }
      const message = typeof body.error === 'string' ? body.error : body.message
      if (typeof message === 'string' && message) return new Error(message)
    } catch {
      /* body wasn't JSON, fall through to the original error */
    }
  }
  return error instanceof Error ? error : new Error(String(error))
}

export async function fetchWallets(userId: string): Promise<Wallet[]> {
  const { data, error } = await supabase
    .from('wallet_members')
    .select('joined_at, wallets(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map((row) => row.wallets as unknown as Wallet)
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

export interface DeliverWalletInviteResult {
  emailSent: boolean
  inAppNotified: boolean
  emailError?: string
}

export async function createWalletInvite(
  walletId: string,
  email: string,
  role: InviteRole,
): Promise<WalletInvite> {
  const { data, error } = await supabase
    .rpc('create_wallet_invite', { p_wallet_id: walletId, p_email: email, p_role: role })
    .single()
  if (error) throw error
  return data as WalletInvite
}

/** Sends the invite email + in-app notification. Safe to retry ("Resend"). */
export async function deliverWalletInvite(inviteId: string): Promise<DeliverWalletInviteResult> {
  const { data, error } = await supabase.functions.invoke<DeliverWalletInviteResult & { error?: string }>(
    'wallet-invite-deliver',
    { body: { inviteId } },
  )
  if (error) throw await unwrapFunctionError(error)
  if (!data) throw new Error('Empty response from wallet-invite-deliver function')
  if (data.error) throw new Error(data.error)
  return { emailSent: !!data.emailSent, inAppNotified: !!data.inAppNotified, emailError: data.emailError }
}

export async function fetchPendingWalletInvites(walletId: string): Promise<WalletInvite[]> {
  const { data, error } = await supabase
    .from('wallet_invites')
    .select('*')
    .eq('wallet_id', walletId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as WalletInvite[]
}

export async function revokeWalletInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_wallet_invite', { p_invite_id: inviteId })
  if (error) throw error
}

export async function fetchMyWalletInvites(): Promise<MyWalletInvite[]> {
  const { data, error } = await supabase.rpc('get_my_wallet_invites')
  if (error) throw error
  return (data ?? []) as MyWalletInvite[]
}

export async function acceptWalletInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_wallet_invite', { p_invite_id: inviteId })
  if (error) throw error
}

export async function declineWalletInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('decline_wallet_invite', { p_invite_id: inviteId })
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
