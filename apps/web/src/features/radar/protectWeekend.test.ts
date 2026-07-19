import { describe, expect, it } from 'vitest'
import { buildProtectWeekendPlan } from './protectWeekend'

describe('buildProtectWeekendPlan', () => {
  it('uses this Friday when already Fri–Sun', () => {
    const fri = new Date('2026-07-17T12:00:00') // Friday
    const plan = buildProtectWeekendPlan({
      safeToSpendDailyMinor: 10_000,
      currency: 'USD',
      now: fri,
    })
    expect(plan.startDate).toBe('2026-07-17')
    expect(plan.endDate).toBe('2026-07-19')
    expect(plan.dailyCapMinor).toBe(6_500)
  })

  it('looks ahead to next Friday mid-week', () => {
    const wed = new Date('2026-07-15T12:00:00') // Wednesday
    const plan = buildProtectWeekendPlan({
      safeToSpendDailyMinor: 10_000,
      currency: 'ZMW',
      now: wed,
    })
    expect(plan.startDate).toBe('2026-07-17')
    expect(plan.chatSeed).toMatch(/protect this weekend/i)
  })
})
