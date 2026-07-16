import type { AiMemoryInput } from '@/features/memory/types'
import type { ProfileMode } from './modes'
import { GENDER_OPTIONS, INCOME_RANGE_OPTIONS, type Gender, type IncomeRange, type PrimaryGoal } from './onboardingOptions'

export function parseHouseholdSize(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export interface OnboardingAnswers {
  mode: ProfileMode
  householdSize: number | null
  primaryGoal: PrimaryGoal | null
  incomeRange: IncomeRange | null
  gender: Gender
}

/** Third-person phrasing for memory content — deliberately independent of the
 * first-person UI labels in onboardingOptions.ts (which read as "your goal"). */
const GOAL_MEMORY_PHRASE: Record<PrimaryGoal, string> = {
  build_emergency_fund: 'build an emergency fund',
  pay_off_debt: 'pay off debt',
  save_for_something: 'save for something specific',
  track_spending: 'track their spending more closely',
}

function incomeRangeLabel(range: IncomeRange): string {
  return INCOME_RANGE_OPTIONS.find((r) => r.value === range)?.label ?? range
}

function genderLabel(gender: Gender): string {
  return GENDER_OPTIONS.find((g) => g.value === gender)?.label ?? gender
}

export function buildOnboardingMemories(answers: OnboardingAnswers, walletId: string | null): AiMemoryInput[] {
  const memories: AiMemoryInput[] = []

  if (answers.primaryGoal) {
    memories.push({
      wallet_id: walletId,
      kind: 'fact',
      content: `Their main financial goal right now is to ${GOAL_MEMORY_PHRASE[answers.primaryGoal]}.`,
      mood: null,
    })
  }

  if (answers.householdSize !== null && answers.mode !== 'individual') {
    const noun = answers.mode === 'business' ? 'team' : 'household'
    memories.push({
      wallet_id: walletId,
      kind: 'fact',
      content: `They manage money for a ${noun} of ${answers.householdSize} people.`,
      mood: null,
    })
  }

  if (answers.incomeRange && answers.incomeRange !== 'prefer_not_to_say') {
    memories.push({
      wallet_id: walletId,
      kind: 'fact',
      content: `They describe their financial situation right now as "${incomeRangeLabel(answers.incomeRange)}".`,
      mood: null,
    })
  }

  if (answers.gender !== 'prefer_not_to_say') {
    memories.push({
      wallet_id: walletId,
      kind: 'preference',
      content: `They identify as ${genderLabel(answers.gender)}. Use this only to keep tone natural and relatable — never to shape financial advice or logic.`,
      mood: null,
    })
  }

  return memories
}
