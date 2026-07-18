import { describe, expect, it } from 'vitest'
import { buildContinuityOpener } from './continuity'

describe('buildContinuityOpener', () => {
  it('returns null when disabled or same-day reopen', () => {
    expect(
      buildContinuityOpener({
        memories: [{ kind: 'fact', content: 'I freelance on Fridays' }],
        personaName: 'Amara',
        daysSinceLastOpen: 0,
      }),
    ).toBeNull()
    expect(
      buildContinuityOpener({
        memories: [{ kind: 'fact', content: 'I freelance on Fridays' }],
        personaName: 'Amara',
        enabled: false,
      }),
    ).toBeNull()
  })

  it('prioritizes an active pact', () => {
    const opener = buildContinuityOpener({
      memories: [{ kind: 'fact', content: 'I freelance' }],
      activePacts: [{ description: 'No takeout', end_date: '2026-07-25' }],
      personaName: 'Amara',
      daysSinceLastOpen: 2,
    })
    expect(opener).toContain('No takeout')
    expect(opener).toContain('2026-07-25')
  })

  it('falls back to a durable fact after a gap', () => {
    const opener = buildContinuityOpener({
      memories: [{ kind: 'fact', content: 'I get paid every other Friday' }],
      personaName: 'Amara',
      daysSinceLastOpen: 3,
    })
    expect(opener).toContain('I get paid every other Friday')
  })
})
