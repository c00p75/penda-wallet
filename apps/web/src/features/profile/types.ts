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

export const PERSONALITIES: { value: AiPersonality; label: string; description: string }[] = [
  {
    value: 'balanced_coach',
    label: 'Balanced coach',
    description: 'Warm, encouraging, and balanced.',
  },
  {
    value: 'angry_mom',
    label: 'Angry mom',
    description: 'Exasperated but loving — tired of the takeout.',
  },
  {
    value: 'wise_mentor',
    label: 'Wise mentor',
    description: 'Calm perspective, never judgment.',
  },
  {
    value: 'chill_friend',
    label: 'Chill friend',
    description: 'Casual, easygoing, keeps you honest.',
  },
  {
    value: 'drill_sergeant',
    label: 'Drill sergeant',
    description: 'Blunt, no-nonsense discipline.',
  },
]
