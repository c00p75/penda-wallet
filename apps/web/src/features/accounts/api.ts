import { supabase } from '@/lib/supabase/client'
import type { Account, AccountInput } from './types'

export async function fetchAccounts(walletId: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('wallet_id', walletId)
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as Account[]
}

export async function fetchAccount(id: string): Promise<Account | null> {
  const { data, error } = await supabase.from('accounts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Account | null) ?? null
}

export async function createAccount(walletId: string, input: AccountInput): Promise<Account> {
  if (input.is_default) {
    await clearDefaultFlag(walletId)
  }
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      wallet_id: walletId,
      name: input.name.trim(),
      kind: input.kind,
      provider: input.provider ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sort_order: input.sort_order ?? 0,
      is_default: input.is_default ?? false,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Account
}

export async function updateAccount(id: string, input: Partial<AccountInput>): Promise<Account> {
  const { data: existing, error: loadError } = await supabase
    .from('accounts')
    .select('wallet_id, is_default')
    .eq('id', id)
    .single()
  if (loadError) throw loadError

  if (input.is_default) {
    await clearDefaultFlag(existing.wallet_id)
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name != null) patch.name = input.name.trim()
  if (input.kind != null) patch.kind = input.kind
  if (input.provider !== undefined) patch.provider = input.provider
  if (input.icon !== undefined) patch.icon = input.icon
  if (input.color !== undefined) patch.color = input.color
  if (input.sort_order != null) patch.sort_order = input.sort_order
  if (input.is_default != null) patch.is_default = input.is_default

  const { data, error } = await supabase
    .from('accounts')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Account
}

export async function archiveAccount(id: string): Promise<void> {
  const { data: existing, error: loadError } = await supabase
    .from('accounts')
    .select('wallet_id, is_default')
    .eq('id', id)
    .single()
  if (loadError) throw loadError

  const { error } = await supabase
    .from('accounts')
    .update({
      archived_at: new Date().toISOString(),
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error

  if (existing.is_default) {
    // Promote the oldest remaining pocket to default.
    const { data: next } = await supabase
      .from('accounts')
      .select('id')
      .eq('wallet_id', existing.wallet_id)
      .is('archived_at', null)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (next?.id) {
      await supabase
        .from('accounts')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', next.id)
    }
  }
}

async function clearDefaultFlag(walletId: string) {
  const { error } = await supabase
    .from('accounts')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('wallet_id', walletId)
    .eq('is_default', true)
  if (error) throw error
}

/**
 * Move money between two pockets in the same money account.
 * Creates a paired transfer (out from source, in to destination).
 */
export async function transferBetweenAccounts(input: {
  walletId: string
  userId: string
  fromAccountId: string
  toAccountId: string
  amountMinor: number
  currency: string
  date: string
  note?: string | null
}): Promise<{ groupId: string }> {
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('Pick two different pockets.')
  }
  if (input.amountMinor <= 0) throw new Error('Transfer amount must be positive.')

  const groupId = crypto.randomUUID()
  const note = input.note?.trim() || 'Transfer between pockets'
  const rows = [
    {
      wallet_id: input.walletId,
      created_by: input.userId,
      account_id: input.fromAccountId,
      category_id: null,
      amount_minor: input.amountMinor,
      currency: input.currency,
      converted_amount_minor: -input.amountMinor,
      fx_rate_to_wallet_base: 1,
      type: 'transfer' as const,
      merchant: null,
      description: note,
      transaction_date: input.date,
      source: 'manual' as const,
      transfer_group_id: groupId,
      user_confirmed: true,
    },
    {
      wallet_id: input.walletId,
      created_by: input.userId,
      account_id: input.toAccountId,
      category_id: null,
      amount_minor: input.amountMinor,
      currency: input.currency,
      converted_amount_minor: input.amountMinor,
      fx_rate_to_wallet_base: 1,
      type: 'transfer' as const,
      merchant: null,
      description: note,
      transaction_date: input.date,
      source: 'manual' as const,
      transfer_group_id: groupId,
      user_confirmed: true,
    },
  ]

  const { error } = await supabase.from('transactions').insert(rows)
  if (error) throw error
  return { groupId }
}
