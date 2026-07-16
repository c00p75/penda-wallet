export type PrimaryGoal = 'build_emergency_fund' | 'pay_off_debt' | 'save_for_something' | 'track_spending'

export interface GoalMeta {
  value: PrimaryGoal
  label: string
  description: string
}

export const GOAL_OPTIONS: GoalMeta[] = [
  {
    value: 'build_emergency_fund',
    label: 'Build an emergency fund',
    description: 'A cushion for surprises — car repairs, medical bills, a slow month.',
  },
  {
    value: 'pay_off_debt',
    label: 'Pay off debt',
    description: 'Get loans, credit, or owed money down to zero.',
  },
  {
    value: 'save_for_something',
    label: 'Save for something specific',
    description: 'A trip, a phone, a deposit — something with a name and a date.',
  },
  {
    value: 'track_spending',
    label: 'Just track my spending better',
    description: 'See where the money actually goes before setting bigger goals.',
  },
]

export type IncomeRange = 'tight' | 'stable' | 'comfortable' | 'prefer_not_to_say'

export interface IncomeRangeMeta {
  value: IncomeRange
  label: string
  description: string
}

export const INCOME_RANGE_OPTIONS: IncomeRangeMeta[] = [
  { value: 'tight', label: 'Tight', description: "Money's stretched most months." },
  { value: 'stable', label: 'Stable', description: 'Covers what I need, not much left over.' },
  { value: 'comfortable', label: 'Comfortable', description: 'Room to save and spend without much worry.' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say', description: 'Skip this — Penda works fine without it.' },
]

export type Gender = 'woman' | 'man' | 'non_binary' | 'prefer_not_to_say'

export interface GenderMeta {
  value: Gender
  label: string
}

export const GENDER_OPTIONS: GenderMeta[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]
