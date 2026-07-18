import { supabase } from '@/src/lib/supabase';
import type { Profile, ProfileInput } from '@/src/api/types';

function normalizeProfile(row: Record<string, unknown>): Profile {
  return {
    ...(row as unknown as Profile),
    notification_prefs:
      row.notification_prefs && typeof row.notification_prefs === 'object'
        ? (row.notification_prefs as Record<string, unknown>)
        : {},
    ai_consent:
      row.ai_consent && typeof row.ai_consent === 'object'
        ? (row.ai_consent as Record<string, unknown>)
        : {},
    ai_trust:
      row.ai_trust && typeof row.ai_trust === 'object'
        ? (row.ai_trust as Record<string, unknown>)
        : {},
    blind_budgeting: Boolean(row.blind_budgeting),
    tax_reserve_pct: Number(row.tax_reserve_pct ?? 0),
    round_up_enabled: Boolean(row.round_up_enabled),
    pay_yourself_first_pct: Number(row.pay_yourself_first_pct ?? 0),
    habits_goal_id: (row.habits_goal_id as string | null) ?? null,
  };
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return normalizeProfile(data as Record<string, unknown>);
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(input)
    .eq('id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizeProfile(data as Record<string, unknown>);
}
