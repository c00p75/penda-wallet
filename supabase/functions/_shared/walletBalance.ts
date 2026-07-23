import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Sum of income minus expense transactions for a wallet, in minor units. */
export async function computeWalletBalanceMinor(
  supabase: SupabaseClient,
  walletId: string,
): Promise<number> {
  const { data: rows, error } = await supabase
    .from('transactions')
    .select('amount_minor, converted_amount_minor, type')
    .eq('wallet_id', walletId)
  if (error) throw error

  return (rows ?? []).reduce((sum, tx) => {
    const amt = (tx.converted_amount_minor as number | null) ?? (tx.amount_minor as number)
    if (tx.type === 'income') return sum + amt
    if (tx.type === 'expense') return sum - amt
    return sum
  }, 0)
}
