import { describe, expect, it } from 'vitest'
import { applyMoodToCoachingText, moodPromptFragment, recentMoodTone } from './moodCoaching'

describe('recentMoodTone', () => {
  it('reads explicit mood labels', () => {
    expect(
      recentMoodTone(
        [{ kind: 'mood', content: 'Rough day', mood: 'stressed', created_at: '2026-07-18T10:00:00Z' }],
        { now: new Date('2026-07-18T12:00:00Z') },
      ),
    ).toBe('stressed')
  })

  it('ignores stale moods', () => {
    expect(
      recentMoodTone(
        [{ kind: 'mood', content: 'anxious about rent', mood: null, created_at: '2026-07-01T10:00:00Z' }],
        { now: new Date('2026-07-18T12:00:00Z') },
      ),
    ).toBeNull()
  })

  it('scans content for stress words', () => {
    expect(
      recentMoodTone(
        [{ kind: 'mood', content: 'Feeling overwhelmed by bills', created_at: '2026-07-17T10:00:00Z' }],
        { now: new Date('2026-07-18T12:00:00Z') },
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
})

describe('moodPromptFragment', () => {
  it('adds guidance for stressed users', () => {
    expect(moodPromptFragment('stressed')).toMatch(/stressed/)
    expect(moodPromptFragment(null)).toBe('')
  })
})
