import { supabase } from '@/lib/supabase/client'
import type {
  Account,
  AccountInput,
  PocketProvider,
  PocketProviderInput,
  PocketType,
  PocketTypeInput,
} from './types'

const SELECT_WITH_TYPES =
  '*, kind:account_kinds(id, wallet_id, name, icon, sort_order, created_at), provider:account_providers(id, wallet_id, name, icon, sort_order, created_at)'

export async function fetchAccounts(walletId: string): Promise<Account[]> {
  const { data, error } = await supabase
    .from('accounts')
    .select(SELECT_WITH_TYPES)
    .eq('wallet_id', walletId)
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as Account[]
}

export async function fetchAccount(id: string): Promise<Account | null> {
  const { data, error } = await supabase
    .from('accounts')
    .select(SELECT_WITH_TYPES)
    .eq('id', id)
    .maybeSingle()
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
      kind_id: input.kind_id,
      provider_id: input.provider_id ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sort_order: input.sort_order ?? 0,
      is_default: input.is_default ?? false,
    })
    .select(SELECT_WITH_TYPES)
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
  if (input.kind_id !== undefined) patch.kind_id = input.kind_id
  if (input.provider_id !== undefined) patch.provider_id = input.provider_id
  if (input.icon !== undefined) patch.icon = input.icon
  if (input.color !== undefined) patch.color = input.color
  if (input.sort_order != null) patch.sort_order = input.sort_order
  if (input.is_default != null) patch.is_default = input.is_default

  const { data, error } = await supabase
    .from('accounts')
    .update(patch)
    .eq('id', id)
    .select(SELECT_WITH_TYPES)
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

export async function fetchPocketTypes(walletId: string): Promise<PocketType[]> {
  const { data, error } = await supabase
    .from('account_kinds')
    .select('*')
    .eq('wallet_id', walletId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as PocketType[]
}

export async function createPocketType(
  walletId: string,
  input: PocketTypeInput,
): Promise<PocketType> {
  const { data, error } = await supabase
    .from('account_kinds')
    .insert({ wallet_id: walletId, ...input })
    .select('*')
    .single()

  if (error) throw error
  return data as PocketType
}

export async function updatePocketType(id: string, input: PocketTypeInput): Promise<PocketType> {
  const { data, error } = await supabase
    .from('account_kinds')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as PocketType
}

export async function deletePocketType(id: string): Promise<void> {
  const { error } = await supabase.from('account_kinds').delete().eq('id', id)
  if (error) throw error
}

export async function fetchPocketProviders(walletId: string): Promise<PocketProvider[]> {
  const { data, error } = await supabase
    .from('account_providers')
    .select('*')
    .eq('wallet_id', walletId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as PocketProvider[]
}

export async function createPocketProvider(
  walletId: string,
  input: PocketProviderInput,
): Promise<PocketProvider> {
  const { data, error } = await supabase
    .from('account_providers')
    .insert({ wallet_id: walletId, ...input })
    .select('*')
    .single()

  if (error) throw error
  return data as PocketProvider
}

export async function updatePocketProvider(
  id: string,
  input: PocketProviderInput,
): Promise<PocketProvider> {
  const { data, error } = await supabase
    .from('account_providers')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as PocketProvider
}

export async function deletePocketProvider(id: string): Promise<void> {
  const { error } = await supabase.from('account_providers').delete().eq('id', id)
  if (error) throw error
}
