import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from './database.types.ts'

/** Sum of income minus expense for a money account (transfers ignored). */
export async function computeWalletBalanceMinor(
  supabase: SupabaseClient<Database>,
  walletId: string,
): Promise<number> {
  const { data: rows, error } = await supabase
    .from('transactions')
    .select('amount_minor, converted_amount_minor, type')
    .eq('wallet_id', walletId)
    .is('deleted_at', null)
  if (error) throw error

  return (rows ?? []).reduce((sum, tx) => {
    const amt = (tx.converted_amount_minor as number | null) ?? (tx.amount_minor as number)
    if (tx.type === 'income') return sum + amt
    if (tx.type === 'expense') return sum - amt
    return sum
  }, 0)
}

/** Balance for one pocket. Transfer legs use signed converted_amount_minor. */
export async function computeAccountBalanceMinor(
  supabase: SupabaseClient<Database>,
  accountId: string,
): Promise<number> {
  const { data: rows, error } = await supabase
    .from('transactions')
    .select('amount_minor, converted_amount_minor, type')
    .eq('account_id', accountId)
    .is('deleted_at', null)
  if (error) throw error

  return (rows ?? []).reduce((sum, tx) => {
    const amt = (tx.converted_amount_minor as number | null) ?? (tx.amount_minor as number)
    if (tx.type === 'income') return sum + amt
    if (tx.type === 'expense') return sum - amt
    if (tx.type === 'transfer') return sum + amt
    return sum
  }, 0)
}

export async function defaultAccountId(
  supabase: SupabaseClient<Database>,
  walletId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('default_account_id', { p_wallet_id: walletId })
  if (error) return null
  return (data as string | null) ?? null
}
