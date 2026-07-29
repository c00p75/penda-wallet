import { describe, expect, it } from 'vitest'
import { bucketGranularityFor, periodRange, previousPeriodRange } from './period'

describe('periodRange', () => {
  it('spans the last 30 days inclusive of today', () => {
    const now = new Date(2026, 6, 29) // Jul 29, 2026
    const range = periodRange('30d', now)
    expect(range.end).toBe('2026-07-29')
    expect(range.start).toBe('2026-06-30')
  })

  it('year-to-date starts on Jan 1 of the current year', () => {
    const now = new Date(2026, 6, 29)
    const range = periodRange('ytd', now)
    expect(range.start).toBe('2026-01-01')
    expect(range.end).toBe('2026-07-29')
  })
})

describe('previousPeriodRange', () => {
  it('is the equal-length window immediately before the current one, no gap or overlap', () => {
    const now = new Date(2026, 6, 29)
    const current = periodRange('30d', now)
    const previous = previousPeriodRange('30d', now)
    const dayBeforeCurrentStart = new Date(`${current.start}T00:00:00`)
    dayBeforeCurrentStart.setDate(dayBeforeCurrentStart.getDate() - 1)
    expect(previous.end).toBe(
      `${dayBeforeCurrentStart.getFullYear()}-${String(dayBeforeCurrentStart.getMonth() + 1).padStart(2, '0')}-${String(dayBeforeCurrentStart.getDate()).padStart(2, '0')}`,
    )
    const currentSpanDays =
      (new Date(`${current.end}T00:00:00`).getTime() - new Date(`${current.start}T00:00:00`).getTime()) /
      86_400_000
    const previousSpanDays =
      (new Date(`${previous.end}T00:00:00`).getTime() - new Date(`${previous.start}T00:00:00`).getTime()) /
      86_400_000
    expect(previousSpanDays).toBe(currentSpanDays)
  })
})

describe('bucketGranularityFor', () => {
  it('scales bucket width with the selected period', () => {
    expect(bucketGranularityFor('30d')).toBe('day')
    expect(bucketGranularityFor('3m')).toBe('week')
    expect(bucketGranularityFor('6m')).toBe('month')
    expect(bucketGranularityFor('12m')).toBe('month')
    expect(bucketGranularityFor('ytd')).toBe('month')
  })
})
