import { describe, expect, it } from 'vitest'
import { DEFAULT_COMPANION_PREFS, normalizeCompanionPrefs } from './companionPrefs'

describe('normalizeCompanionPrefs', () => {
  it('defaults missing keys', () => {
    expect(normalizeCompanionPrefs(null)).toEqual(DEFAULT_COMPANION_PREFS)
    expect(normalizeCompanionPrefs({ quiet_enabled: true, quiet_after_hour: 22 })).toMatchObject({
      quiet_enabled: true,
      quiet_after_hour: 22,
      weekly_letter: true,
      pact_follow_up: true,
    })
  })

  it('clamps hours', () => {
    expect(normalizeCompanionPrefs({ quiet_after_hour: 99 }).quiet_after_hour).toBe(23)
    expect(normalizeCompanionPrefs({ quiet_before_hour: -3 }).quiet_before_hour).toBe(0)
  })
})
