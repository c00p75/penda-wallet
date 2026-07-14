import { describe, expect, it } from 'vitest'
import { relativeTimeLabel } from './relativeTime'

const NOW = new Date('2026-07-15T12:00:00Z')

describe('relativeTimeLabel', () => {
  it('labels recent points warmly', () => {
    expect(relativeTimeLabel('2026-07-15T09:00:00Z', NOW)).toBe('Today')
    expect(relativeTimeLabel('2026-07-14T09:00:00Z', NOW)).toBe('Yesterday')
    expect(relativeTimeLabel('2026-07-12T09:00:00Z', NOW)).toBe('3 days ago')
  })

  it('rolls up into weeks, months and years', () => {
    expect(relativeTimeLabel('2026-07-06T12:00:00Z', NOW)).toBe('A week ago')
    expect(relativeTimeLabel('2026-06-10T12:00:00Z', NOW)).toBe('A month ago')
    expect(relativeTimeLabel('2026-04-01T12:00:00Z', NOW)).toBe('3 months ago')
    expect(relativeTimeLabel('2025-07-10T12:00:00Z', NOW)).toBe('One year ago')
  })
})
