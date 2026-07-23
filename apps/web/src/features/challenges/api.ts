import { supabase } from '@/lib/supabase/client'
import type { Challenge, ChallengeInput, LeaderboardEntry } from './types'

export async function fetchChallenges(): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from('budget_challenges')
    .select('*')
    .is('archived_at', null)
    .order('end_date', { ascending: false })

  if (error) throw error
  return data as unknown as Challenge[]
}

export async function fetchArchivedChallenges(): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from('budget_challenges')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false })

  if (error) throw error
  return data as unknown as Challenge[]
}

export async function createChallenge(input: ChallengeInput): Promise<Challenge> {
  const { data, error } = await supabase.rpc('create_challenge', {
    p_name: input.name,
    p_type: input.type,
    p_target_metric: input.target_metric,
    p_start_date: input.start_date,
    p_end_date: input.end_date,
    p_wallet_id: input.wallet_id,
  })

  if (error) throw error
  return data as unknown as Challenge
}

export async function joinChallenge(inviteCode: string): Promise<Challenge> {
  const { data, error } = await supabase.rpc('join_challenge', { p_invite_code: inviteCode })
  if (error) throw error
  return data as unknown as Challenge
}

export async function leaveChallenge(challengeId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('challenge_participants')
    .delete()
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)

  if (error) throw error
}

export async function archiveChallenge(challengeId: string): Promise<void> {
  const { error } = await supabase
    .from('budget_challenges')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', challengeId)
  if (error) throw error
}

export async function unarchiveChallenge(challengeId: string): Promise<void> {
  const { error } = await supabase
    .from('budget_challenges')
    .update({ archived_at: null })
    .eq('id', challengeId)
  if (error) throw error
}

export async function fetchLeaderboard(challengeId: string): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('get_challenge_leaderboard', {
    p_challenge_id: challengeId,
  })

  if (error) throw error
  return data
}
