import { supabase } from '@/lib/supabase/client'
import type { BalanceReconciliation, ReconciliationStatus } from './types'

export async function fetchLatestReconciliation(
  walletId: string,
  userId: string,
): Promise<BalanceReconciliation | null> {
  const { data, error } = await supabase
    .from('balance_reconciliations')
    .select('*')
    .eq('wallet_id', walletId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function createReconciliation(input: {
  walletId: string
  userId: string
  computedBalanceMinor: number
  actualBalanceMinor: number
  status: ReconciliationStatus
}): Promise<BalanceReconciliation> {
  const { data, error } = await supabase
    .from('balance_reconciliations')
    .insert({
      wallet_id: input.walletId,
      user_id: input.userId,
      computed_balance_minor: input.computedBalanceMinor,
      actual_balance_minor: input.actualBalanceMinor,
      status: input.status,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}
