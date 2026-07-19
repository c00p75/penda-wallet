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

  it('hushes on low mood when quiet_when_stressed', () => {
    expect(
      shouldQuietNudge({
        prefs: DEFAULT_COMPANION_PREFS,
        recentMood: 'low',
        now: new Date(2026, 6, 18, 12),
      }),
    ).toBe(true)
  })

  it('does not hush on ok/up moods', () => {
    for (const mood of ['ok', 'up'] as const) {
      expect(
        shouldQuietNudge({
          prefs: DEFAULT_COMPANION_PREFS,
          recentMood: mood,
          now: new Date(2026, 6, 18, 12),
        }),
      ).toBe(false)
    }
  })

  it('treats after===before as no quiet-hours window', () => {
    const prefs = {
      ...DEFAULT_COMPANION_PREFS,
      quiet_enabled: true,
      quiet_after_hour: 10,
      quiet_before_hour: 10,
    }
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 10) })).toBe(false)
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 22) })).toBe(false)
  })

  it('supports a non-wrapping daytime quiet window', () => {
    const prefs = {
      ...DEFAULT_COMPANION_PREFS,
      quiet_enabled: true,
      quiet_after_hour: 13,
      quiet_before_hour: 15,
    }
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 12) })).toBe(false)
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 14) })).toBe(true)
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 15) })).toBe(false)
  })

  it('boundary: exactly at quiet_after_hour is quiet (wrap window)', () => {
    const prefs = {
      ...DEFAULT_COMPANION_PREFS,
      quiet_enabled: true,
      quiet_after_hour: 21,
      quiet_before_hour: 8,
    }
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 21) })).toBe(true)
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 20) })).toBe(false)
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 8) })).toBe(false)
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 18, 7) })).toBe(true)
  })

  it('Sunday quiet wins even outside quiet hours', () => {
    const prefs = {
      ...DEFAULT_COMPANION_PREFS,
      quiet_enabled: true,
      quiet_on_sundays: true,
      quiet_after_hour: 21,
      quiet_before_hour: 8,
    }
    // Sunday noon: outside wrap window but Sunday flag
    expect(shouldQuietNudge({ prefs, now: new Date(2026, 6, 19, 12) })).toBe(true)
  })

  it('ignores null recent mood', () => {
    expect(
      shouldQuietNudge({
        prefs: DEFAULT_COMPANION_PREFS,
        recentMood: null,
        now: new Date(2026, 6, 18, 12),
      }),
    ).toBe(false)
  })
})
