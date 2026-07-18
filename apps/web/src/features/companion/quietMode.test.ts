import { describe, expect, it } from 'vitest'
import { DEFAULT_COMPANION_PREFS } from './companionPrefs'
import { shouldQuietNudge } from './quietMode'

describe('shouldQuietNudge', () => {
  it('is off by default', () => {
    expect(
      shouldQuietNudge({
        prefs: DEFAULT_COMPANION_PREFS,
        now: new Date(2026, 6, 18, 22), // Sat 10pm
      }),
    ).toBe(false)
  })

  it('hushes after quiet hours when enabled', () => {
    const prefs = { ...DEFAULT_COMPANION_PREFS, quiet_enabled: true }
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 22) })).toBe(true)
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 10) })).toBe(false)
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 7) })).toBe(true)
  })

  it('hushes on Sundays when asked', () => {
    // July 19 2026 is a Sunday
    const prefs = { ...DEFAULT_COMPANION_PREFS, quiet_on_sundays: true }
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 19, 12) })).toBe(true)
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 12) })).toBe(false)
  })

  it('hushes when stressed if quiet_when_stressed', () => {
    expect(
      shouldQuietNudge({
        prefs: DEFAULT_COMPANION_PREFS,
        recentMood: 'stressed',
        now: new Date(2026, 6, 18, 12),
      }),
    ).toBe(true)
    expect(
      shouldQuietNudge({
        prefs: { ...DEFAULT_COMPANION_PREFS, quiet_when_stressed: false },
        recentMood: 'stressed',
        now: new Date(2026, 6, 18, 12),
      }),
    ).toBe(false)
  })
})
