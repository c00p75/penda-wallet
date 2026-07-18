import type { SavingsGoal } from './types'

/**
 * What a goal needs this month to stay on pace toward its target date, the
 * bridge that lets a savings goal behave like a budget line (roadmap bet
 * #11 "goals as budget lines"): the safe-to-spend reserve treats an
 * un-met monthly contribution the same way it treats a bill still due.
 * Goals with no target date, already met, or overdue-with-nothing-sensible
 * to compute contribute nothing (they don't block spending on a guess).
 */
export function requiredMonthlyContribution(goal: SavingsGoal, now: Date = new Date()): number {
  const remaining = goal.target_amount_minor - goal.current_amount_minor
  if (remaining <= 0 || !goal.target_date) return 0

  const target = new Date(`${goal.target_date}T00:00:00Z`)
  const monthsRemaining = Math.max(
    1,
    (target.getUTCFullYear() - now.getUTCFullYear()) * 12 + (target.getUTCMonth() - now.getUTCMonth()),
  )
  return Math.ceil(remaining / monthsRemaining)
}

export function totalMonthlyGoalReserve(goals: SavingsGoal[], now: Date = new Date()): number {
  return goals.reduce((sum, goal) => sum + requiredMonthlyContribution(goal, now), 0)
}
