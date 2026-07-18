import { describe, expect, it } from 'vitest'
import { payYourselfFirstMinor, roundUpSpareMinor } from './moneyHabits'

describe('roundUpSpareMinor', () => {
  it('returns spare change to next major unit', () => {
    expect(roundUpSpareMinor(1250)).toBe(50)
    expect(roundUpSpareMinor(1200)).toBe(0)
    expect(roundUpSpareMinor(1)).toBe(99)
  })

  it('returns 0 for non-positive amounts', () => {
    expect(roundUpSpareMinor(0)).toBe(0)
    expect(roundUpSpareMinor(-10)).toBe(0)
  })
})

describe('payYourselfFirstMinor', () => {
  it('floors the percent of amount', () => {
    expect(payYourselfFirstMinor(10_000, 10)).toBe(1000)
    expect(payYourselfFirstMinor(999, 10)).toBe(99)
  })

  it('returns 0 when pct or amount is zero', () => {
    expect(payYourselfFirstMinor(1000, 0)).toBe(0)
    expect(payYourselfFirstMinor(0, 10)).toBe(0)
  })
})
