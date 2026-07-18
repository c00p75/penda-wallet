import { supabase } from '@/lib/supabase/client'

export interface PlanShare {
  plan_id: string
  member_id: string
  allocated_minor: number
}

export async function fetchPlanShares(planId: string): Promise<PlanShare[]> {
  const { data, error } = await supabase
    .from('spending_plan_shares')
    .select('plan_id, member_id, allocated_minor')
    .eq('plan_id', planId)
  if (error) throw error
  return data ?? []
}

export async function savePlanShares(
  planId: string,
  shares: Array<{ member_id: string; allocated_minor: number }>,
): Promise<void> {
  await supabase.from('spending_plan_shares').delete().eq('plan_id', planId)
  if (shares.length === 0) return
  const { error } = await supabase.from('spending_plan_shares').insert(
    shares.map((s) => ({
      plan_id: planId,
      member_id: s.member_id,
      allocated_minor: s.allocated_minor,
    })),
  )
  if (error) throw error
}
