import { describe, expect, it } from 'vitest'
import { computeSpendingPlanStatus } from './spendingPlan'

// July has 31 days; the 15th is just under halfway through.
const NOW = new Date('2026-07-15T10:00:00Z')

describe('computeSpendingPlanStatus', () => {
  it('flags a frugal month as ahead of plan', () => {
    const s = computeSpendingPlanStatus({
      intendedMinor: 1_200_000,
      spentMinor: 500_000,
      monthStart: '2026-07-01',
      now: NOW,
    })
    expect(s.projectedMinor).toBe(1_033_333)
    expect(s.pace).toBe('ahead')
    expect(s.remainingMinor).toBe(700_000)
    expect(s.daysLeft).toBe(16)
    expect(s.dailyAllowanceMinor).toBe(43_750)
  })

  it('reads a steady spender as on track', () => {
    const s = computeSpendingPlanStatus({
      intendedMinor: 1_240_000,
      spentMinor: 600_000, // 40k/day * 15 days, exactly on the 40k/day plan
      monthStart: '2026-07-01',
      now: NOW,
    })
    expect(s.projectedMinor).toBe(1_240_000)
    expect(s.pace).toBe('on-track')
  })

  it('marks over-pace before the budget is blown', () => {
    const s = computeSpendingPlanStatus({
      intendedMinor: 1_000_000,
      spentMinor: 700_000, // projects to ~1.44m
      monthStart: '2026-07-01',
      now: NOW,
    })
    expect(s.pace).toBe('over-pace')
  })

  it('marks over once actuals exceed the intention', () => {
    const s = computeSpendingPlanStatus({
      intendedMinor: 1_000_000,
      spentMinor: 1_100_000,
      monthStart: '2026-07-01',
      now: NOW,
    })
    expect(s.pace).toBe('over')
    expect(s.remainingMinor).toBe(-100_000)
    expect(s.dailyAllowanceMinor).toBe(0)
  })
})
