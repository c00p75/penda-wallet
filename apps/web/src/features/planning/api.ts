import { supabase } from '@/lib/supabase/client'
import type { SpendingPlan, SpendingPlanInput } from './types'

export async function fetchSpendingPlan(walletId: string, month: string): Promise<SpendingPlan | null> {
  const { data, error } = await supabase
    .from('spending_plans')
    .select('*')
    .eq('wallet_id', walletId)
    .eq('month', month)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function upsertSpendingPlan(
  walletId: string,
  userId: string,
  input: SpendingPlanInput,
): Promise<SpendingPlan> {
  const { data, error } = await supabase
    .from('spending_plans')
    .upsert({ wallet_id: walletId, created_by: userId, ...input }, { onConflict: 'wallet_id,month' })
    .select('*')
    .single()

  if (error) throw error
  return data
}
