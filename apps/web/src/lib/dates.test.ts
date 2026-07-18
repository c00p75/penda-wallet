import { describe, expect, it } from 'vitest'
import { addLocalDays, localDateStr, localMonthEnd, localMonthPrefix, localMonthStart, parseLocalDate } from './dates'

describe('local date helpers', () => {
  it('formats a known local calendar day without UTC shift', () => {
    const d = new Date(2026, 6, 18, 23, 30, 0) // Jul 18 local evening
    expect(localDateStr(d)).toBe('2026-07-18')
    expect(localMonthStart(d)).toBe('2026-07-01')
    expect(localMonthEnd(d)).toBe('2026-07-31')
    expect(localMonthPrefix(d)).toBe('2026-07')
  })

  it('parses and steps in local calendar space', () => {
    const d = parseLocalDate('2026-07-14')
    expect(localDateStr(d)).toBe('2026-07-14')
    expect(addLocalDays(d, 2)).toBe('2026-07-16')
  })
})
