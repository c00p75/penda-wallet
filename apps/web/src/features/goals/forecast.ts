import type { SavingsContribution, SavingsGoal } from './types'

const DAY_MS = 86_400_000

export interface GoalForecast {
  kind: 'reached' | 'projected' | 'insufficient-data' | 'not-saving'
  projectedDate?: string
}

export function estimateGoalCompletion(goal: SavingsGoal, contributions: SavingsContribution[]): GoalForecast {
  if (goal.current_amount_minor >= goal.target_amount_minor) {
    return { kind: 'reached' }
  }
  if (contributions.length === 0) {
    return { kind: 'insufficient-data' }
  }

  const earliest = contributions.reduce(
    (min, c) => (c.contributed_date < min ? c.contributed_date : min),
    contributions[0].contributed_date,
  )
  const daysElapsed = Math.max(1, Math.round((Date.now() - new Date(`${earliest}T00:00:00`).getTime()) / DAY_MS))

  if (daysElapsed < 3) {
    return { kind: 'insufficient-data' }
  }

  const dailyRate = goal.current_amount_minor / daysElapsed
  if (dailyRate <= 0) {
    return { kind: 'not-saving' }
  }

  const remaining = goal.target_amount_minor - goal.current_amount_minor
  const daysNeeded = Math.ceil(remaining / dailyRate)
  const projected = new Date(Date.now() + daysNeeded * DAY_MS)

  return { kind: 'projected', projectedDate: projected.toISOString().slice(0, 10) }
}
