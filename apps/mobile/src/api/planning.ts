import { supabase } from '@/src/lib/supabase';
import type { PlanShare, SpendingPlan } from '@/src/api/types';

export async function fetchSpendingPlan(walletId: string, month: string): Promise<SpendingPlan | null> {
  const { data, error } = await supabase
    .from('spending_plans')
    .select('*')
    .eq('wallet_id', walletId)
    .eq('month', month)
    .maybeSingle();

  if (error) throw error;
  return data as SpendingPlan | null;
}

export async function deleteSpendingPlan(id: string): Promise<void> {
  const { error } = await supabase.from('spending_plans').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchPlanShares(planId: string): Promise<PlanShare[]> {
  const { data, error } = await supabase
    .from('spending_plan_shares')
    .select('plan_id, member_id, allocated_minor')
    .eq('plan_id', planId);
  if (error) throw error;
  return (data ?? []) as PlanShare[];
}

export async function savePlanShares(
  planId: string,
  shares: Array<{ member_id: string; allocated_minor: number }>,
): Promise<void> {
  await supabase.from('spending_plan_shares').delete().eq('plan_id', planId);
  if (shares.length === 0) return;
  const { error } = await supabase.from('spending_plan_shares').insert(
    shares.map((s) => ({
      plan_id: planId,
      member_id: s.member_id,
      allocated_minor: s.allocated_minor,
    })),
  );
  if (error) throw error;
}
