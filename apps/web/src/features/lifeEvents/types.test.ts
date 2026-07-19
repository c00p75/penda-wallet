import { describe, expect, it } from 'vitest'
import {
  lifeEventActive,
  lifeEventCoachingLine,
  normalizeLifeEvent,
} from './types'

describe('life events', () => {
  it('normalizes valid payloads', () => {
    expect(
      normalizeLifeEvent({
        kind: 'travel',
        label: 'Cape Town',
        starts_on: '2026-07-01',
        ends_on: '2026-07-20',
      }),
    ).toEqual({
      kind: 'travel',
      label: 'Cape Town',
      starts_on: '2026-07-01',
      ends_on: '2026-07-20',
    })
    expect(normalizeLifeEvent({ kind: 'nope' })).toBeNull()
  })

  it('checks active window', () => {
    const ev = {
      kind: 'newborn' as const,
      label: 'Baby',
      starts_on: '2026-07-01',
      ends_on: '2026-08-01',
    }
    expect(lifeEventActive(ev, '2026-07-18')).toBe(true)
    expect(lifeEventActive(ev, '2026-08-02')).toBe(false)
    expect(lifeEventActive(undefined, '2026-07-18')).toBe(false)
    expect(lifeEventActive(null, '2026-07-18')).toBe(false)
    expect(lifeEventCoachingLine(ev)).toMatch(/Newborn/)
  })
})
