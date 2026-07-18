import { describe, expect, it } from 'vitest'
import { evidenceForInsight } from './nudgeEvidence'

describe('evidenceForInsight', () => {
  it('explains underspend opportunities', () => {
    const ev = evidenceForInsight('opportunity:underspend', { goalName: 'Emergency fund' })
    expect(ev.summary).toMatch(/spending/i)
    expect(ev.bullets.some((b) => b.includes('Emergency fund'))).toBe(true)
  })

  it('explains family tips', () => {
    const ev = evidenceForInsight('family-allowance-low:a1')
    expect(ev.summary).toMatch(/Household/)
  })
})
