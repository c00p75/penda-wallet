/** Client mirror of profiles.companion_prefs, keep in sync with edge `_shared/companionPrefs.ts`. */

export interface CompanionPrefs {
  quiet_enabled: boolean
  /** Local hour (0–23) after which soft nudges hush. */
  quiet_after_hour: number
  /** Local hour (0–23) before which soft nudges hush (morning). */
  quiet_before_hour: number
  quiet_on_sundays: boolean
  quiet_when_stressed: boolean
  weekly_letter: boolean
  pact_follow_up: boolean
  payday_companion: boolean
  continuity_openers: boolean
  family_nudges: boolean
}

export const DEFAULT_COMPANION_PREFS: CompanionPrefs = {
  quiet_enabled: false,
  quiet_after_hour: 21,
  quiet_before_hour: 8,
  quiet_on_sundays: false,
  quiet_when_stressed: true,
  weekly_letter: true,
  pact_follow_up: true,
  payday_companion: true,
  continuity_openers: true,
  family_nudges: true,
}

function clampHour(n: unknown, fallback: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(23, Math.max(0, Math.round(v)))
}

export function normalizeCompanionPrefs(raw: unknown): CompanionPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    quiet_enabled: o.quiet_enabled === true,
    quiet_after_hour: clampHour(o.quiet_after_hour, DEFAULT_COMPANION_PREFS.quiet_after_hour),
    quiet_before_hour: clampHour(o.quiet_before_hour, DEFAULT_COMPANION_PREFS.quiet_before_hour),
    quiet_on_sundays: o.quiet_on_sundays === true,
    quiet_when_stressed: o.quiet_when_stressed !== false,
    weekly_letter: o.weekly_letter !== false,
    pact_follow_up: o.pact_follow_up !== false,
    payday_companion: o.payday_companion !== false,
    continuity_openers: o.continuity_openers !== false,
    family_nudges: o.family_nudges !== false,
  }
}
