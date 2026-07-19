import { describe, expect, it } from 'vitest'
import { applyMoodToCoachingText, moodPromptFragment, recentMoodTone } from './moodCoaching'

const NOW = new Date('2026-07-18T12:00:00Z')

describe('recentMoodTone', () => {
  it('reads explicit mood labels', () => {
    expect(
      recentMoodTone(
        [{ kind: 'mood', content: 'Rough day', mood: 'stressed', created_at: '2026-07-18T10:00:00Z' }],
        { now: NOW },
      ),
    ).toBe('stressed')
  })

  it.each([
    ['anxious', 'stressed'],
    ['worried', 'stressed'],
    ['sad', 'low'],
    ['tired', 'low'],
    ['down', 'low'],
    ['happy', 'up'],
    ['great', 'up'],
    ['excited', 'up'],
    ['proud', 'up'],
  ] as const)('label %s → %s', (mood, tone) => {
    expect(
      recentMoodTone([{ kind: 'mood', content: 'x', mood, created_at: '2026-07-18T10:00:00Z' }], {
        now: NOW,
      }),
    ).toBe(tone)
  })

  it('ignores stale moods', () => {
    expect(
      recentMoodTone(
        [{ kind: 'mood', content: 'anxious about rent', mood: null, created_at: '2026-07-01T10:00:00Z' }],
        { now: NOW },
      ),
    ).toBeNull()
  })

  it('scans content for stress words', () => {
    expect(
      recentMoodTone(
        [{ kind: 'mood', content: 'Feeling overwhelmed by bills', created_at: '2026-07-17T10:00:00Z' }],
        { now: NOW },
      ),
    ).toBe('stressed')
  })

  it.each([
    ['Feeling broke this week', 'stressed'],
    ['A bit sad about money', 'low'],
    ['Feeling drained', 'low'],
    ['Feeling grateful today', 'up'],
    ['Feeling calm and steady', 'up'],
  ] as const)('content "%s" → %s', (content, tone) => {
    expect(
      recentMoodTone([{ kind: 'mood', content, created_at: '2026-07-17T10:00:00Z' }], { now: NOW }),
    ).toBe(tone)
  })

  it('ignores non-mood memory kinds', () => {
    expect(
      recentMoodTone(
        [{ kind: 'fact', content: 'I am stressed', created_at: '2026-07-18T10:00:00Z' }],
        { now: NOW },
      ),
    ).toBeNull()
  })

  it('treats missing created_at as recent', () => {
    expect(recentMoodTone([{ kind: 'mood', content: 'anxious' }], { now: NOW })).toBe('stressed')
  })

  it('prefers the first matching recent entry', () => {
    expect(
      recentMoodTone(
        [
          { kind: 'mood', content: 'ok day', mood: 'happy', created_at: '2026-07-18T11:00:00Z' },
          { kind: 'mood', content: 'was stressed', mood: 'stressed', created_at: '2026-07-17T10:00:00Z' },
        ],
        { now: NOW },
      ),
    ).toBe('up')
  })

  it('respects custom maxAgeDays', () => {
    expect(
      recentMoodTone(
        [{ kind: 'mood', content: 'anxious', created_at: '2026-07-10T10:00:00Z' }],
        { now: NOW, maxAgeDays: 3 },
      ),
    ).toBeNull()
    expect(
      recentMoodTone(
        [{ kind: 'mood', content: 'anxious', created_at: '2026-07-10T10:00:00Z' }],
        { now: NOW, maxAgeDays: 10 },
      ),
    ).toBe('stressed')
  })
})

describe('applyMoodToCoachingText', () => {
  it('softens stressed coaching', () => {
    const out = applyMoodToCoachingText('You spent K50 less than usual this week!', 'stressed')
    expect(out).toMatch(/^No pressure/)
    expect(out).not.toContain('!')
  })

  it('softens low mood coaching', () => {
    const out = applyMoodToCoachingText('Great job sticking to budget!', 'low')
    expect(out).not.toContain('!')
  })

  it('leaves ok/up/null coaching intact', () => {
    const text = 'You spent K50 less than usual!'
    expect(applyMoodToCoachingText(text, 'ok')).toBe(text)
    expect(applyMoodToCoachingText(text, 'up')).toBe(text)
    expect(applyMoodToCoachingText(text, null)).toBe(text)
  })
})

describe('moodPromptFragment', () => {
  it('adds guidance for stressed users', () => {
    expect(moodPromptFragment('stressed')).toMatch(/stressed/)
    expect(moodPromptFragment(null)).toBe('')
  })

  it.each(['low', 'up'] as const)('returns a fragment for %s', (tone) => {
    const frag = moodPromptFragment(tone)
    expect(frag.length).toBeGreaterThan(0)
  })

  it('returns empty for ok mood (default coaching)', () => {
    expect(moodPromptFragment('ok')).toBe('')
  })
})
