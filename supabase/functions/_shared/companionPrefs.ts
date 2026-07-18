/** Mirrors apps/web/src/features/companion/companionPrefs.ts */

export type CompanionPrefs = {
  quiet_enabled: boolean
  quiet_after_hour: number
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

export type MoodTone = 'stressed' | 'low' | 'ok' | 'up'

export function shouldQuietNudge(opts: {
  prefs: CompanionPrefs
  /** UTC hour if timezone unknown, prefer local when available. */
  hour: number
  dayOfWeek: number
  recentMood?: MoodTone | null
}): boolean {
  const { prefs } = opts
  if (prefs.quiet_enabled) {
    const after = prefs.quiet_after_hour
    const before = prefs.quiet_before_hour
    const inQuietHours =
      after === before
        ? false
        : after > before
          ? opts.hour >= after || opts.hour < before
          : opts.hour >= after && opts.hour < before
    if (inQuietHours) return true
  }
  if (prefs.quiet_on_sundays && opts.dayOfWeek === 0) return true
  if (prefs.quiet_when_stressed && (opts.recentMood === 'stressed' || opts.recentMood === 'low')) {
    return true
  }
  return false
}

export function recentMoodTone(
  memories: Array<{ kind: string; content: string; mood?: string | null; created_at?: string }>,
  now = new Date(),
): MoodTone | null {
  const maxAgeMs = 5 * 86_400_000
  const recent = memories
    .filter((m) => m.kind === 'mood')
    .filter((m) => {
      if (!m.created_at) return true
      const t = Date.parse(m.created_at)
      return Number.isFinite(t) && now.getTime() - t <= maxAgeMs
    })
    .slice(0, 5)
  if (recent.length === 0) return null
  for (const m of recent) {
    const label = (m.mood ?? '').toLowerCase()
    if (['stressed', 'anxious', 'worried'].includes(label)) return 'stressed'
    if (['sad', 'low', 'tired', 'down'].includes(label)) return 'low'
    if (['happy', 'great', 'excited', 'proud'].includes(label)) return 'up'
    const text = `${m.mood ?? ''} ${m.content}`
    if (/\b(stress|anxious|overwhelm|worried)\b/i.test(text)) return 'stressed'
    if (/\b(sad|tired|drained|low)\b/i.test(text)) return 'low'
  }
  return 'ok'
}
