import { Briefcase, User, Users, type LucideIcon } from 'lucide-react'

export type ProfileMode = 'individual' | 'family' | 'business'

export interface ModeTerms {
  income: string
  expense: string
  balance: string
  plan: string
}

export interface ModeConfig {
  value: ProfileMode
  label: string
  description: string
  icon: LucideIcon
  terms: ModeTerms
  /** Steers how the AI frames things for this mode. */
  aiContext: string
}

export const MODE_CONFIG: Record<ProfileMode, ModeConfig> = {
  individual: {
    value: 'individual',
    label: 'Individual',
    description: 'Just me and my money.',
    icon: User,
    terms: { income: 'Income', expense: 'Spending', balance: 'Balance', plan: 'Spending plan' },
    aiContext:
      'This is a personal account. Frame guidance around personal goals, everyday spending, and peace of mind.',
  },
  family: {
    value: 'family',
    label: 'Family',
    description: 'Shared priorities and a household budget.',
    icon: Users,
    terms: {
      income: 'Household income',
      expense: 'Household spending',
      balance: 'Household balance',
      plan: 'Household plan',
    },
    aiContext:
      'This is a family account. Frame guidance around shared priorities, household bills (rent, school fees, groceries), and coordinating between members.',
  },
  business: {
    value: 'business',
    label: 'Business',
    description: 'Side-hustle lite — revenue, expenses, runway.',
    icon: Briefcase,
    terms: { income: 'Revenue', expense: 'Expenses', balance: 'Cash on hand', plan: 'Budget' },
    aiContext:
      'This is a small business / side-hustle account. Frame guidance around margins, cash runway, revenue vs expenses, and setting money aside for tax.',
  },
}

export const PROFILE_MODES: ModeConfig[] = [MODE_CONFIG.individual, MODE_CONFIG.family, MODE_CONFIG.business]

/** The right word for a concept in the user's chosen mode (falls back to individual). */
export function termFor(mode: ProfileMode, key: keyof ModeTerms): string {
  return (MODE_CONFIG[mode] ?? MODE_CONFIG.individual).terms[key]
}
