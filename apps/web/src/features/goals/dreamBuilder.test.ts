import { describe, expect, it } from 'vitest'
import { monthlyContributionMinor } from './dreamBuilder'

const NOW = new Date('2026-07-14T10:00:00Z')

describe('monthlyContributionMinor', () => {
  it('splits the remaining amount across the months until the target date', () => {
    // K5000 target, K1000 saved, due in 3 months -> K4000 / 3
    expect(monthlyContributionMinor(500000, 100000, '2026-10-14', NOW)).toBe(133334)
  })

  it('returns null when there is no target date to pace against', () => {
    expect(monthlyContributionMinor(500000, 100000, null, NOW)).toBeNull()
  })

  it('returns 0 once the goal is already funded', () => {
    expect(monthlyContributionMinor(500000, 500000, '2026-10-14', NOW)).toBe(0)
    expect(monthlyContributionMinor(500000, 600000, '2026-10-14', NOW)).toBe(0)
  })

  it('asks for the whole remainder now when the date is in the past', () => {
    expect(monthlyContributionMinor(500000, 100000, '2026-06-14', NOW)).toBe(400000)
  })
})
