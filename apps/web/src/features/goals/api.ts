import { supabase } from '@/lib/supabase/client'
import type { SavingsContribution, SavingsGoal, SavingsGoalInput } from './types'

export async function uploadGoalImage(walletId: string, file: File): Promise<string> {
  const extension = file.name.split('.').pop() || 'jpg'
  const path = `${walletId}/${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage.from('goal-images').upload(path, file, { contentType: file.type })
  if (error) throw error

  return path
}

export function getGoalImageUrl(imagePath: string): string {
  return supabase.storage.from('goal-images').getPublicUrl(imagePath).data.publicUrl
}

export async function fetchSavingsGoals(walletId: string): Promise<SavingsGoal[]> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('*')
    .eq('wallet_id', walletId)
    .is('archived_at', null)
    .order('created_at')

  if (error) throw error
  return data
}

export async function fetchArchivedSavingsGoals(walletId: string): Promise<SavingsGoal[]> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('*')
    .eq('wallet_id', walletId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })

  if (error) throw error
  return data
}

export async function fetchSavingsGoal(id: string): Promise<SavingsGoal | null> {
  const { data, error } = await supabase.from('savings_goals').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
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
    .single()

  if (error) throw error

  if (initialAmountMinor > 0) {
    const { error: contribError } = await supabase
      .from('savings_contributions')
      .insert({ goal_id: goal.id, amount_minor: initialAmountMinor })
    if (contribError) throw contribError
    goal.current_amount_minor = initialAmountMinor
  }

  return goal
}

export async function updateSavingsGoal(id: string, input: SavingsGoalInput): Promise<SavingsGoal> {
  const { data, error } = await supabase
    .from('savings_goals')
    .update(input)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function archiveSavingsGoal(id: string): Promise<void> {
  const { error } = await supabase
    .from('savings_goals')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function unarchiveSavingsGoal(id: string): Promise<void> {
  const { error } = await supabase.from('savings_goals').update({ archived_at: null }).eq('id', id)
  if (error) throw error
}

export async function fetchContributions(goalId: string): Promise<SavingsContribution[]> {
  const { data, error } = await supabase
    .from('savings_contributions')
    .select('*')
    .eq('goal_id', goalId)
    .order('contributed_date', { ascending: false })

  if (error) throw error
  return data
}

export async function addContribution(goalId: string, amountMinor: number, date: string): Promise<void> {
  const { error } = await supabase
    .from('savings_contributions')
    .insert({ goal_id: goalId, amount_minor: amountMinor, contributed_date: date })

  if (error) throw error
}
