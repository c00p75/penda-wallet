import { describe, expect, it } from 'vitest'
import type { SavingsGoal } from './types'
import { requiredMonthlyContribution, totalMonthlyGoalReserve } from './goalContribution'

const NOW = new Date('2026-07-15T00:00:00Z')

function goal(overrides: Partial<SavingsGoal>): SavingsGoal {
  return {
    id: 'g1',
    wallet_id: 'w1',
    name: 'New laptop',
    icon: null,
    target_amount_minor: 0,
    current_amount_minor: 0,
    target_date: null,
    motivation: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('requiredMonthlyContribution', () => {
  it('splits the remaining amount evenly across the months left to the target date', () => {
    const g = goal({ target_amount_minor: 500_000, current_amount_minor: 200_000, target_date: '2026-10-15' })
    // 3 months remaining (Jul -> Oct), 300k remaining -> 100k/mo.
    expect(requiredMonthlyContribution(g, NOW)).toBe(100_000)
  })

  it('returns 0 once the goal is already met', () => {
    const g = goal({ target_amount_minor: 100_000, current_amount_minor: 100_000, target_date: '2026-12-01' })
    expect(requiredMonthlyContribution(g, NOW)).toBe(0)
  })

  it('returns 0 for goals with no target date', () => {
    const g = goal({ target_amount_minor: 500_000, current_amount_minor: 0, target_date: null })
    expect(requiredMonthlyContribution(g, NOW)).toBe(0)
  })

  it('floors months remaining at 1 for an overdue or same-month target', () => {
    const g = goal({ target_amount_minor: 300_000, current_amount_minor: 0, target_date: '2026-07-20' })
    expect(requiredMonthlyContribution(g, NOW)).toBe(300_000)
  })
})

describe('totalMonthlyGoalReserve', () => {
  it('sums required contributions across all goals', () => {
    const goals = [
      goal({ id: 'g1', target_amount_minor: 500_000, current_amount_minor: 200_000, target_date: '2026-10-15' }),
      goal({ id: 'g2', target_amount_minor: 100_000, current_amount_minor: 100_000, target_date: '2026-12-01' }),
      goal({ id: 'g3', target_amount_minor: 60_000, current_amount_minor: 0, target_date: '2026-09-15' }),
    ]
    // g1: 100k, g2: 0 (met), g3: 30k (2 months) -> 130k total.
    expect(totalMonthlyGoalReserve(goals, NOW)).toBe(130_000)
  })

  it('returns 0 for no goals', () => {
    expect(totalMonthlyGoalReserve([], NOW)).toBe(0)
  })
})
