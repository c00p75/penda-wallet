import { describe, expect, it } from 'vitest'
import { explainSafeToSpend } from './safeToSpendExplain'

describe('explainSafeToSpend', () => {
  it('lists the math bullets', () => {
    const ev = explainSafeToSpend(
      {
        intendedMinor: 100_000,
        spentMinor: 40_000,
        upcomingFixedMinor: 20_000,
        daysLeftInMonth: 10,
        safeDailyMinor: 4_000,
        safeTotalMinor: 40_000,
      },
      (m) => `$${(m / 100).toFixed(0)}`,
    )
    expect(ev.summary).toMatch(/\$40\/day/)
    expect(ev.bullets).toHaveLength(5)
    expect(ev.bullets[2]).toMatch(/fixed/)
  })
})
