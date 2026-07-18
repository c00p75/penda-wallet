import type { MoodMemory } from './moodCoaching'

export interface ContinuityPact {
  description: string
  end_date: string
}

export interface ContinuityInput {
  memories: MoodMemory[]
  activePacts?: ContinuityPact[]
  /** Last user-facing topic the assistant locked onto (optional). */
  lastThreadHint?: string | null
  daysSinceLastOpen?: number | null
  personaName: string
  enabled?: boolean
}

/**
 * Build a natural "last time…" opener for when chat opens empty after a gap.
 * Returns null when there's nothing worth continuing, never invents context.
 */
export function buildContinuityOpener(input: ContinuityInput): string | null {
  if (input.enabled === false) return null

  const gap = input.daysSinceLastOpen
  if (gap != null && gap < 1) return null

  const factOrPref = input.memories.find(
    (m) => (m.kind === 'fact' || m.kind === 'preference') && m.content.trim().length > 0,
  )
  const recentMood = input.memories.find((m) => m.kind === 'mood' && m.content.trim().length > 0)
  const pact = input.activePacts?.[0]
  const hint = input.lastThreadHint?.trim()

  // Priority: active pact check-in → thread hint → mood → durable fact.
  if (pact) {
    return `Hey. last we talked you were holding to "${trim(pact.description, 60)}" through ${pact.end_date}. How’s that going?`
  }

  if (hint && hint.length >= 12) {
    return `Last time you mentioned ${trim(hint, 80)}, want to pick that up?`
  }

  if (recentMood && (gap == null || gap >= 1)) {
    return `${input.personaName} here. Last journal note: "${trim(recentMood.content, 70)}". How are you feeling about money today?`
  }

  if (factOrPref && (gap == null || gap >= 2)) {
    return `Quick check-in. I still remember ${trim(factOrPref.content, 70)}. Anything you want to log or plan?`
  }

  if (gap != null && gap >= 5) {
    return `Welcome back. Want a quick look at this week, or just log something?`
  }

  return null
}

function trim(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ')
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}
