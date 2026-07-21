import type { ProfileMode } from './modes'
import type { Gender, IncomeRange, PrimaryGoal } from './onboardingOptions'
import type { LifeEvent } from '@/features/lifeEvents/types'
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from '@/features/notifications/prefs'
import {
  DEFAULT_COMPANION_PREFS,
  type CompanionPrefs,
} from '@/features/companion/companionPrefs'

export type { NotificationPrefs, CompanionPrefs }
export { DEFAULT_NOTIFICATION_PREFS, DEFAULT_COMPANION_PREFS }

/** Active + legacy values stored on profiles. Prefer `resolveAiPersonality` for UI/prompts. */
export type AiPersonality =
  | 'balanced_coach'
  | 'angry_mom'
  | 'wise_mentor'
  | 'chill_friend'
  | 'drill_sergeant'
  | 'funny_comedian'
  | 'gen_z'
  | 'hustler'
  | 'gogo'
  | 'analyst'

/** Personas shown in pickers. Legacy values still resolve via `resolveAiPersonality`. */
export type ActiveAiPersonality =
  | 'balanced_coach'
  | 'angry_mom'
  | 'drill_sergeant'
  | 'funny_comedian'
  | 'hustler'
  | 'analyst'

/** Map retired personas onto the closest active voice. */
export const LEGACY_PERSONALITY_FALLBACKS: Partial<Record<AiPersonality, ActiveAiPersonality>> = {
  wise_mentor: 'analyst',
  chill_friend: 'balanced_coach',
  gen_z: 'funny_comedian',
  gogo: 'angry_mom',
}

export function resolveAiPersonality(
  value: AiPersonality | string | null | undefined,
): ActiveAiPersonality {
  const raw = (value ?? 'balanced_coach') as AiPersonality
  const mapped = LEGACY_PERSONALITY_FALLBACKS[raw] ?? raw
  if (
    mapped === 'balanced_coach' ||
    mapped === 'angry_mom' ||
    mapped === 'drill_sergeant' ||
    mapped === 'funny_comedian' ||
    mapped === 'hustler' ||
    mapped === 'analyst'
  ) {
    return mapped
  }
  return 'balanced_coach'
}

export interface AiConsent {
  auto_log_sms: boolean
  act_without_confirm: boolean
  parse_clipboard: boolean
  unprompted_coaching: boolean
}

export const DEFAULT_AI_CONSENT: AiConsent = {
  auto_log_sms: true,
  act_without_confirm: false,
  parse_clipboard: true,
  unprompted_coaching: true,
}

export interface AiTrust {
  confirmed_ok: number
  confirmed_undone: number
  auto_loose: boolean
}

export const DEFAULT_AI_TRUST: AiTrust = {
  confirmed_ok: 0,
  confirmed_undone: 0,
  auto_loose: false,
}

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  default_currency: string
  ai_personality: AiPersonality
  mode: ProfileMode
  household_size: number | null
  primary_goal: PrimaryGoal | null
  income_range: IncomeRange | null
  gender: Gender
  notification_opt_in: boolean
  notification_prefs: NotificationPrefs
  companion_prefs: CompanionPrefs
  ai_consent: AiConsent
  ai_trust: AiTrust
  blind_budgeting: boolean
  tax_reserve_pct: number
  round_up_enabled: boolean
  pay_yourself_first_pct: number
  habits_goal_id: string | null
  life_event: LifeEvent | null
  created_at: string
}

export interface ProfileInput {
  display_name?: string | null
  ai_personality?: AiPersonality
  mode?: ProfileMode
  household_size?: number | null
  primary_goal?: PrimaryGoal | null
  income_range?: IncomeRange | null
  gender?: Gender
  notification_opt_in?: boolean
  notification_prefs?: NotificationPrefs
  companion_prefs?: CompanionPrefs
  ai_consent?: AiConsent
  ai_trust?: AiTrust
  blind_budgeting?: boolean
  tax_reserve_pct?: number
  round_up_enabled?: boolean
  pay_yourself_first_pct?: number
  habits_goal_id?: string | null
  life_event?: LifeEvent | null
}

export interface PersonalityMeta {
  value: AiPersonality
  /** The character's given name, the headline shown to the user. */
  name: string
  /** The archetype, shown as a subtitle under the name. */
  label: string
  description: string
  /** A line in this persona's own voice, shown as a live preview when picked. */
  preview: string
  /** Character tint, a CSS color expression, used for the face and card accent. */
  accent: string
}

// Ordered so the picker alternates by gender (male, female, male, female …)
// rather than grouping the three women, then the three men.
export const PERSONALITIES: PersonalityMeta[] = [
  {
    value: 'hustler',
    name: 'Musa',
    label: 'The hustler',
    description: 'Growth mindset, earn more, not just spend less.',
    preview: 'K600 left is fine. Real question: what’s bringing more in? What did you sell this week?',
    accent: 'oklch(0.64 0.15 155)',
  },
  {
    value: 'balanced_coach',
    name: 'Amara',
    label: 'Balanced coach',
    description: 'Warm, encouraging, and balanced.',
    preview: "You're K600 ahead of last month. Steady wins like this add up.",
    accent: 'var(--iris)',
  },
  {
    value: 'analyst',
    name: 'Alex',
    label: 'The analyst',
    description: 'Just the numbers, precise, no fluff.',
    preview: 'K600 remaining, 5 days to payday: K120/day. Current average: K185/day. Overshoot risk ~K325.',
    accent: 'oklch(0.58 0.03 250)',
  },
  {
    value: 'angry_mom',
    name: 'Mama Rose',
    label: 'Angry mom',
    description: 'Exasperated but loving, tired of the takeout.',
    preview: 'Takeout again? Ay. There’s rice at home, you know.',
    accent: 'var(--rose)',
  },
  {
    value: 'drill_sergeant',
    name: 'Sarge',
    label: 'Drill sergeant',
    description: 'Blunt, no-nonsense discipline.',
    preview: 'K600 left. That’s the line. Do not cross it. Move.',
    accent: 'oklch(0.6 0.09 250)',
  },
  {
    value: 'funny_comedian',
    name: 'Bobo',
    label: 'Funny comedian',
    description: 'Cracks jokes, still gets the point across.',
    preview: 'K600 left and payday’s Friday? That’s not a budget, that’s a hostage situation. We’ll make it. 😄',
    accent: 'oklch(0.8 0.16 70)',
  },
]

export function personalityMeta(
  value: AiPersonality | string | null | undefined,
): PersonalityMeta {
  const resolved = resolveAiPersonality(value)
  return PERSONALITIES.find((p) => p.value === resolved) ?? PERSONALITIES[0]!
}

/** Active + retired display names, for retargeting stored check-in copy. */
export const PERSONA_DISPLAY_NAMES: readonly string[] = [
  ...PERSONALITIES.map((p) => p.name),
  'Sena',
  'Kabwe',
  'Zee',
  'Gogo',
  'Nomsa',
]
