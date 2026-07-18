import { supabase } from '@/src/lib/supabase';
import type { SavingsGoal, SavingsGoalInput } from '@/src/api/types';

export async function fetchSavingsGoals(walletId: string): Promise<SavingsGoal[]> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('*')
    .eq('wallet_id', walletId)
    .order('created_at');

  if (error) throw error;
  return data;
}

export async function createSavingsGoal(
  walletId: string,
  input: SavingsGoalInput,
  initialAmountMinor: number,
): Promise<SavingsGoal> {
  const { data: goal, error } = await supabase
    .from('savings_goals')
    .insert({ wallet_id: walletId, ...input })
    .select('*')
    .single();

  if (error) throw error;

  if (initialAmountMinor > 0) {
    const { error: contribError } = await supabase
      .from('savings_contributions')
      .insert({ goal_id: goal.id, amount_minor: initialAmountMinor });
    if (contribError) throw contribError;
    goal.current_amount_minor = initialAmountMinor;
  }

  return goal;
}

export async function addContribution(goalId: string, amountMinor: number, date: string): Promise<void> {
  const { error } = await supabase
    .from('savings_contributions')
    .insert({ goal_id: goalId, amount_minor: amountMinor, contributed_date: date });

  if (error) throw error;
}

export async function deleteSavingsGoal(id: string): Promise<void> {
  const { error } = await supabase.from('savings_goals').delete().eq('id', id);
  if (error) throw error;
}
