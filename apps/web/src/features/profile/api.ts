import { supabase } from '@/lib/supabase/client'
import { normalizeNotificationPrefs } from '@/features/notifications/prefs'
import { normalizeCompanionPrefs } from '@/features/companion/companionPrefs'
import { normalizeLifeEvent } from '@/features/lifeEvents/types'
import {
  DEFAULT_AI_CONSENT,
  DEFAULT_AI_TRUST,
  type AiTrust,
  type Profile,
  type ProfileInput,
} from './types'

function normalizeHomeCardOrder(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((id): id is string => typeof id === 'string')
}

function normalizeHomeCardColors(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

function normalizeAiTrust(raw: unknown): AiTrust {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AI_TRUST }
  const o = raw as Record<string, unknown>
  return {
    confirmed_ok: Math.max(0, Number(o.confirmed_ok) || 0),
    confirmed_undone: Math.max(0, Number(o.confirmed_undone) || 0),
    auto_loose: Boolean(o.auto_loose),
  }
}

function normalizeProfile(row: Record<string, unknown>): Profile {
  const consent = row.ai_consent
  return {
    ...(row as unknown as Profile),
    ai_consent:
      consent && typeof consent === 'object'
        ? { ...DEFAULT_AI_CONSENT, ...(consent as object) }
        : DEFAULT_AI_CONSENT,
    ai_trust: normalizeAiTrust(row.ai_trust),
    notification_prefs: normalizeNotificationPrefs(row.notification_prefs),
    companion_prefs: normalizeCompanionPrefs(row.companion_prefs),
    blind_budgeting: Boolean(row.blind_budgeting),
    tax_reserve_pct: Number(row.tax_reserve_pct ?? 0),
    round_up_enabled: Boolean(row.round_up_enabled),
    pay_yourself_first_pct: Number(row.pay_yourself_first_pct ?? 0),
    habits_goal_id: (row.habits_goal_id as string | null) ?? null,
    life_event: normalizeLifeEvent(row.life_event),
    timezone: (row.timezone as string | null) ?? null,
    onboarding_completed_at: (row.onboarding_completed_at as string | null) ?? null,
    home_card_order: normalizeHomeCardOrder(row.home_card_order),
    home_card_colors: normalizeHomeCardColors(row.home_card_colors),
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
