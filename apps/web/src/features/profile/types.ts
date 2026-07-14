export type AiPersonality =
  | 'balanced_coach'
  | 'angry_mom'
  | 'wise_mentor'
  | 'chill_friend'
  | 'drill_sergeant'

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  default_currency: string
  ai_personality: AiPersonality
  created_at: string
}

export interface ProfileInput {
  display_name: string | null
  ai_personality: AiPersonality
}

export interface PersonalityMeta {
  value: AiPersonality
  label: string
  description: string
  /** A line in this persona's own voice, shown as a live preview when picked. */
  preview: string
  /** Character tint — a CSS color expression, used for the face and card accent. */
  accent: string
}

export const PERSONALITIES: PersonalityMeta[] = [
  {
    value: 'balanced_coach',
    label: 'Balanced coach',
    description: 'Warm, encouraging, and balanced.',
    preview: 'You’re K600 ahead of last month — steady wins like this add up.',
    accent: 'var(--iris)',
  },
  {
    value: 'angry_mom',
    label: 'Angry mom',
    description: 'Exasperated but loving — tired of the takeout.',
    preview: 'Takeout again? Ay. There’s rice at home, you know.',
    accent: 'var(--rose)',
  },
  {
    value: 'wise_mentor',
    label: 'Wise mentor',
    description: 'Calm perspective, never judgment.',
    preview: 'Spending is just choices made visible. You’re seeing them now — that’s the work.',
    accent: 'var(--mint)',
  },
  {
    value: 'chill_friend',
    label: 'Chill friend',
    description: 'Casual, easygoing, keeps you honest.',
    preview: 'No stress — you’ve still got K600 for the weekend. Enjoy it.',
    accent: 'var(--apricot)',
  },
  {
    value: 'drill_sergeant',
    label: 'Drill sergeant',
    description: 'Blunt, no-nonsense discipline.',
    preview: 'K600 left. That’s the line. Do not cross it. Move.',
    accent: 'oklch(0.6 0.09 250)',
  },
]
