import type { CompanionPrefs } from './companionPrefs'
import type { MoodTone } from './moodCoaching'

/**
 * Soft nudges (tips, morning minute, coaching push) hush when quiet mode
 * rules match. Alerts (budget breaches) should still get through, callers
 * decide which kinds are "soft".
 */
export function shouldQuietNudge(opts: {
  prefs: CompanionPrefs
  now?: Date
  recentMood?: MoodTone | null
}): boolean {
  const { prefs } = opts
  if (!prefs.quiet_enabled && !prefs.quiet_when_stressed && !prefs.quiet_on_sundays) {
    return false
  }

  const now = opts.now ?? new Date()
  const hour = now.getHours()
  const isSunday = now.getDay() === 0

  if (prefs.quiet_enabled) {
    const after = prefs.quiet_after_hour
    const before = prefs.quiet_before_hour
    // Window can wrap midnight (e.g. 21 → 8).
    const inQuietHours =
      after === before ? false : after > before ? hour >= after || hour < before : hour >= after && hour < before
    if (inQuietHours) return true
  }

  if (prefs.quiet_on_sundays && isSunday) return true

  if (prefs.quiet_when_stressed && (opts.recentMood === 'stressed' || opts.recentMood === 'low')) {
    return true
  }

  return false
}
