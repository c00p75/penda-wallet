import { supabase } from '@/lib/supabase/client'
import type { Budget, BudgetInput, BudgetProgress } from './types'

export async function fetchBudgets(walletId: string): Promise<Budget[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('wallet_id', walletId)
    .order('created_at')

  if (error) throw error
  return data
}

export async function fetchBudget(id: string): Promise<Budget | null> {
  const { data, error } = await supabase.from('budgets').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function fetchBudgetProgress(walletId: string): Promise<BudgetProgress[]> {
  const { data, error } = await supabase.rpc('get_budget_progress', { p_wallet_id: walletId })
  if (error) throw error
  return data
}

export async function createBudget(walletId: string, input: BudgetInput): Promise<Budget> {
  const { data, error } = await supabase
    .from('budgets')
    .insert({ wallet_id: walletId, ...input })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function updateBudget(id: string, input: BudgetInput): Promise<Budget> {
  const { data, error } = await supabase
    .from('budgets')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function deleteBudget(id: string): Promise<void> {
  const { error } = await supabase.from('budgets').delete().eq('id', id)
  if (error) throw error
}
