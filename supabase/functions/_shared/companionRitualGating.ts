/**
 * Pure gating helpers for companion-rituals cron.
 * Keeps skip reasons testable without Supabase.
 */

import {
  normalizeCompanionPrefs,
  recentMoodTone,
  shouldQuietNudge,
  type CompanionPrefs,
  type MoodTone,
} from './companionPrefs.ts'
import { normalizeEngagementStats, shouldSkipSoftNudge, type EngagementStats } from './engagement.ts'

export type RitualSkipReason = 'adaptive' | 'quiet' | 'no_wallet'

export type PactFollowKind = 'midpoint' | 'end' | 'broken'

export function midpointDate(start: string, end: string): string {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  return new Date((a + b) / 2).toISOString().slice(0, 10)
}

export function daysAgo(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/** Which pact follow-up (if any) should fire today. Broken wins over mid/end. */
export function classifyPactFollowUp(opts: {
  today: string
  startDate: string
  endDate: string
  broken: boolean
}): PactFollowKind | null {
  if (opts.broken) return 'broken'
  const mid = midpointDate(opts.startDate, opts.endDate)
  if (opts.today === mid) return 'midpoint'
  if (opts.today === opts.endDate) return 'end'
  return null
}

/**
 * Soft-nudge skip before any wallet work. Returns null when the ritual may proceed.
 */
export function companionRitualSkipReason(opts: {
  engagement: EngagementStats | unknown
  prefs: CompanionPrefs | unknown
  hour: number
  dayOfWeek: number
  recentMood?: MoodTone | null
  moodMemories?: Array<{ kind: string; content: string; mood?: string | null; created_at?: string }>
  now?: Date
}): 'adaptive' | 'quiet' | null {
  const engagement = normalizeEngagementStats(opts.engagement)
  if (shouldSkipSoftNudge(engagement)) return 'adaptive'

  const prefs = normalizeCompanionPrefs(opts.prefs)
  const mood =
    opts.recentMood !== undefined
      ? opts.recentMood
      : recentMoodTone(opts.moodMemories ?? [], opts.now ?? new Date())

  if (
    shouldQuietNudge({
      prefs,
      hour: opts.hour,
      dayOfWeek: opts.dayOfWeek,
      recentMood: mood,
    })
  ) {
    return 'quiet'
  }

  return null
}

/** Cron auth: require matching X-Cron-Secret. */
export function cronSecretAuthorized(
  provided: string | null,
  expected: string | undefined | null,
): boolean {
  if (!expected) return false
  return provided === expected
}
