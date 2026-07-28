import { describe, expect, it } from 'vitest'
import { clockInTimezone } from './timezoneClock'

describe('clockInTimezone', () => {
  it('returns UTC parts for UTC timezone', () => {
    const now = new Date('2026-07-28T21:30:00.000Z')
    expect(clockInTimezone('UTC', now)).toEqual({ hour: 21, dayOfWeek: 2 })
  })

  it('falls back safely for invalid timezone', () => {
    const now = new Date('2026-07-28T12:00:00.000Z')
    const result = clockInTimezone('Not/AZone', now)
    expect(result.hour).toBe(now.getUTCHours())
    expect(result.dayOfWeek).toBe(now.getUTCDay())
  })
})
