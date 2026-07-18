import { supabase } from '@/src/lib/supabase';
import type { Challenge, ChallengeInput, LeaderboardEntry } from '@/src/api/types';

export async function fetchChallenges(): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from('budget_challenges')
    .select('*')
    .order('end_date', { ascending: false });

  if (error) throw error;
  return data as unknown as Challenge[];
}

export async function createChallenge(input: ChallengeInput): Promise<Challenge> {
  const { data, error } = await supabase.rpc('create_challenge', {
    p_name: input.name,
    p_type: input.type,
    p_target_metric: input.target_metric,
    p_start_date: input.start_date,
    p_end_date: input.end_date,
    p_wallet_id: input.wallet_id,
  });

  if (error) throw error;
  return data as unknown as Challenge;
}

export async function joinChallenge(inviteCode: string): Promise<Challenge> {
  const { data, error } = await supabase.rpc('join_challenge', { p_invite_code: inviteCode });
  if (error) throw error;
  return data as unknown as Challenge;
}

export async function leaveChallenge(challengeId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('challenge_participants')
    .delete()
    .eq('challenge_id', challengeId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function deleteChallenge(challengeId: string): Promise<void> {
  const { error } = await supabase.from('budget_challenges').delete().eq('id', challengeId);
  if (error) throw error;
}

export async function fetchLeaderboard(challengeId: string): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('get_challenge_leaderboard', {
    p_challenge_id: challengeId,
  });

  if (error) throw error;
  return data as LeaderboardEntry[];
}
