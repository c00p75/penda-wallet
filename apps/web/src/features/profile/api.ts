import { supabase } from '@/lib/supabase/client'
import { normalizeNotificationPrefs } from '@/features/notifications/prefs'
import { DEFAULT_AI_CONSENT, type Profile, type ProfileInput } from './types'

function normalizeProfile(row: Record<string, unknown>): Profile {
  const consent = row.ai_consent
  return {
    ...(row as unknown as Profile),
    ai_consent:
      consent && typeof consent === 'object'
        ? { ...DEFAULT_AI_CONSENT, ...(consent as object) }
        : DEFAULT_AI_CONSENT,
    notification_prefs: normalizeNotificationPrefs(row.notification_prefs),
    blind_budgeting: Boolean(row.blind_budgeting),
    tax_reserve_pct: Number(row.tax_reserve_pct ?? 0),
    round_up_enabled: Boolean(row.round_up_enabled),
    pay_yourself_first_pct: Number(row.pay_yourself_first_pct ?? 0),
  }
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) throw error
  return normalizeProfile(data as Record<string, unknown>)
}

export async function updateProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(input)
    .eq('id', userId)
    .select('*')
    .single()

  if (error) throw error
  return normalizeProfile(data as Record<string, unknown>)
}
