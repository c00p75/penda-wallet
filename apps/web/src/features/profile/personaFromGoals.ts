import type { PrimaryGoal } from './onboardingOptions'
import type { ActiveAiPersonality } from './types'

/** Highest match in this list wins the default onboarding persona. */
const PERSONA_GOAL_PRIORITY: readonly {
  goal: PrimaryGoal
  personality: ActiveAiPersonality
}[] = [
  { goal: 'pay_off_debt', personality: 'drill_sergeant' },
  { goal: 'track_spending', personality: 'analyst' },
  { goal: 'save_for_something', personality: 'hustler' },
  { goal: 'build_emergency_fund', personality: 'balanced_coach' },
]

/**
 * Pick a default AI persona from multi-select onboarding goals.
 * Order of selection does not matter; a fixed priority table decides.
 */
export function personaFromGoals(goals: PrimaryGoal[]): ActiveAiPersonality {
  const selected = new Set(goals)
  for (const entry of PERSONA_GOAL_PRIORITY) {
    if (selected.has(entry.goal)) return entry.personality
  }
  return 'balanced_coach'
}
