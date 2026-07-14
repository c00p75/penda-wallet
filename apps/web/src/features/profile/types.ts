import {
  Calculator,
  Compass,
  Flame,
  HeartHandshake,
  Laugh,
  ShieldAlert,
  Smile,
  Sparkles,
  Sprout,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import type { ProfileMode } from './modes'

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

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  default_currency: string
  ai_personality: AiPersonality
  mode: ProfileMode
  created_at: string
}

export interface ProfileInput {
  display_name: string | null
  ai_personality: AiPersonality
  mode: ProfileMode
}

export interface PersonalityMeta {
  value: AiPersonality
  label: string
  description: string
  /** A line in this persona's own voice, shown as a live preview when picked. */
  preview: string
  /** Character tint — a CSS color expression, used for the face and card accent. */
  accent: string
  /** Symbol shown on the persona's avatar orb. */
  icon: LucideIcon
}

export const PERSONALITIES: PersonalityMeta[] = [
  {
    value: 'balanced_coach',
    label: 'Balanced coach',
    description: 'Warm, encouraging, and balanced.',
    preview: 'You’re K600 ahead of last month — steady wins like this add up.',
    accent: 'var(--iris)',
    icon: HeartHandshake,
  },
  {
    value: 'angry_mom',
    label: 'Angry mom',
    description: 'Exasperated but loving — tired of the takeout.',
    preview: 'Takeout again? Ay. There’s rice at home, you know.',
    accent: 'var(--rose)',
    icon: Flame,
  },
  {
    value: 'wise_mentor',
    label: 'Wise mentor',
    description: 'Calm perspective, never judgment.',
    preview: 'Spending is just choices made visible. You’re seeing them now — that’s the work.',
    accent: 'var(--mint)',
    icon: Compass,
  },
  {
    value: 'chill_friend',
    label: 'Chill friend',
    description: 'Casual, easygoing, keeps you honest.',
    preview: 'No stress — you’ve still got K600 for the weekend. Enjoy it.',
    accent: 'var(--apricot)',
    icon: Smile,
  },
  {
    value: 'drill_sergeant',
    label: 'Drill sergeant',
    description: 'Blunt, no-nonsense discipline.',
    preview: 'K600 left. That’s the line. Do not cross it. Move.',
    accent: 'oklch(0.6 0.09 250)',
    icon: ShieldAlert,
  },
  {
    value: 'funny_comedian',
    label: 'Funny comedian',
    description: 'Cracks jokes, still gets the point across.',
    preview: 'K600 left and payday’s Friday? That’s not a budget, that’s a hostage situation. We’ll make it. 😄',
    accent: 'oklch(0.8 0.16 70)',
    icon: Laugh,
  },
  {
    value: 'gen_z',
    label: 'Gen-Z bestie',
    description: 'Very online, hype, keeps it real.',
    preview: 'K600 ahead?? okay we don’t claim broke behavior in this house 💅 financial icon fr.',
    accent: 'oklch(0.68 0.2 350)',
    icon: Sparkles,
  },
  {
    value: 'hustler',
    label: 'The hustler',
    description: 'Growth mindset — earn more, not just spend less.',
    preview: 'K600 left is fine. Real question: what’s bringing more in? What did you sell this week?',
    accent: 'oklch(0.64 0.15 155)',
    icon: TrendingUp,
  },
  {
    value: 'gogo',
    label: 'Gogo',
    description: 'A grandmother’s frugal wisdom, never rushed.',
    preview: 'Eh, you have K600? Put half away before it grows legs. A little saved often becomes a lot.',
    accent: 'oklch(0.6 0.09 45)',
    icon: Sprout,
  },
  {
    value: 'analyst',
    label: 'The analyst',
    description: 'Just the numbers — precise, no fluff.',
    preview: 'K600 remaining, 5 days to payday: K120/day. Current average: K185/day. Overshoot risk ~K325.',
    accent: 'oklch(0.58 0.03 250)',
    icon: Calculator,
  },
]
