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
      lastThreadHint: 'talking about budgets for a while now',
    })
    expect(opener).toContain('No takeout')
    expect(opener).toContain('2026-07-25')
    expect(opener).not.toContain('budgets')
  })

  it('uses thread hint over mood when hint is long enough', () => {
    const opener = buildContinuityOpener({
      memories: [{ kind: 'mood', content: 'Feeling stretched this week' }],
      lastThreadHint: 'cutting transport costs next month',
      personaName: 'Amara',
      daysSinceLastOpen: 2,
    })
    expect(opener).toContain('cutting transport costs')
    expect(opener).not.toContain('Feeling stretched')
  })

  it('ignores short thread hints', () => {
    const opener = buildContinuityOpener({
      memories: [{ kind: 'mood', content: 'Feeling stretched this week' }],
      lastThreadHint: 'hi',
      personaName: 'Amara',
      daysSinceLastOpen: 2,
    })
    expect(opener).toContain('Feeling stretched')
  })

  it('falls back to a durable fact after a gap of 2+ days', () => {
    const opener = buildContinuityOpener({
      memories: [{ kind: 'fact', content: 'I get paid every other Friday' }],
      personaName: 'Amara',
      daysSinceLastOpen: 3,
    })
    expect(opener).toContain('I get paid every other Friday')
  })

  it('does not use fact on a 1-day gap without mood/hint/pact', () => {
    expect(
      buildContinuityOpener({
        memories: [{ kind: 'fact', content: 'I get paid every other Friday' }],
        personaName: 'Amara',
        daysSinceLastOpen: 1,
      }),
    ).toBeNull()
  })

  it('welcome-back after a long absence with no memories', () => {
    const opener = buildContinuityOpener({
      memories: [],
      personaName: 'Amara',
      daysSinceLastOpen: 5,
    })
    expect(opener).toMatch(/welcome back/i)
  })

  it('returns null for a 2-day gap with empty memories and no hint', () => {
    expect(
      buildContinuityOpener({
        memories: [],
        personaName: 'Amara',
        daysSinceLastOpen: 2,
      }),
    ).toBeNull()
  })

  it('trims long pact descriptions with an ellipsis', () => {
    const long = 'Avoid impulse buys at the mall every single weekend no matter what'
    const opener = buildContinuityOpener({
      memories: [],
      activePacts: [{ description: long, end_date: '2026-08-01' }],
      personaName: 'Amara',
      daysSinceLastOpen: 2,
    })
    expect(opener).toContain('…')
    expect(opener!.length).toBeLessThan(long.length + 80)
  })

  it('skips blank memory content', () => {
    expect(
      buildContinuityOpener({
        memories: [
          { kind: 'mood', content: '   ' },
          { kind: 'fact', content: '' },
        ],
        personaName: 'Amara',
        daysSinceLastOpen: 3,
      }),
    ).toBeNull()
  })

  it('includes persona name on mood openers', () => {
    const opener = buildContinuityOpener({
      memories: [{ kind: 'mood', content: 'Anxious about rent' }],
      personaName: 'Penda',
      daysSinceLastOpen: 1,
    })
    expect(opener).toContain('Penda')
    expect(opener).toContain('Anxious about rent')
  })

  it('prefers preference memories as durable facts', () => {
    const opener = buildContinuityOpener({
      memories: [{ kind: 'preference', content: 'Hates subscriptions' }],
      personaName: 'Amara',
      daysSinceLastOpen: 4,
    })
    expect(opener).toContain('Hates subscriptions')
  })
})
