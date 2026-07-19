import type { SavingsGoalInput } from '@/features/goals/types'
import type { PrimaryGoal } from './onboardingOptions'

/** Seed a first savings goal from the onboarding primary-goal pick. */
export function starterGoalFromPrimary(primaryGoal: PrimaryGoal | null): SavingsGoalInput | null {
  switch (primaryGoal) {
    case 'build_emergency_fund':
      return {
        name: 'Emergency fund',
        icon: '🛡️',
        image_path: null,
        target_amount_minor: 500_000, // soft starter, user can edit
        target_date: null,
        motivation: 'A cushion for surprises',
      }
    case 'save_for_something':
      return {
        name: 'My savings goal',
        icon: '🎯',
        image_path: null,
        target_amount_minor: 200_000,
        target_date: null,
        motivation: 'Something specific, rename me',
      }
    case 'track_spending':
      return {
        name: 'Know where it goes',
        icon: '👀',
        image_path: null,
        target_amount_minor: 100_000,
        target_date: null,
        motivation: 'A soft reminder to log often this month',
      }
    case 'pay_off_debt':
      // Debt is seeded as a debts row; no savings goal.
      return null
    default:
      return null
  }
}
