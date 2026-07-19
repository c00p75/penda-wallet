export type MoodTone = 'stressed' | 'low' | 'ok' | 'up'

const STRESSED = /\b(stress(ed|ful)?|anxious|anxiety|overwhelm(ed)?|panic|scared|worried|tight|broke)\b/i
const LOW = /\b(sad|down|tired|exhausted|drained|low|depressed|hopeless)\b/i
const UP = /\b(great|good|happy|excited|proud|calm|steady|grateful|hopeful)\b/i

export interface MoodMemory {
  kind: string
  content: string
  mood?: string | null
  created_at?: string
}

/**
 * Derive a coaching tone from recent mood journal entries. Prefers an
 * explicit mood label, then scans content. Ignores entries older than
 * `maxAgeDays` (default 5).
 */
export function recentMoodTone(
  memories: MoodMemory[],
  opts: { now?: Date; maxAgeDays?: number } = {},
): MoodTone | null {
  const now = opts.now ?? new Date()
  const maxAgeMs = (opts.maxAgeDays ?? 5) * 86_400_000
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
    const label = (m.mood ?? '').toLowerCase().trim()
    if (label === 'stressed' || label === 'anxious' || label === 'worried') return 'stressed'
    if (label === 'sad' || label === 'low' || label === 'tired' || label === 'down') return 'low'
    if (label === 'happy' || label === 'great' || label === 'excited' || label === 'proud') return 'up'
    if (label === 'ok' || label === 'calm' || label === 'fine') return 'ok'

    const text = `${m.mood ?? ''} ${m.content}`
    if (STRESSED.test(text)) return 'stressed'
    if (LOW.test(text)) return 'low'
    if (UP.test(text)) return 'up'
  }

  return 'ok'
}

/** Soften or amp coaching copy based on mood. Pure string transform. */
export function applyMoodToCoachingText(text: string, tone: MoodTone | null): string {
  if (!tone || tone === 'ok') return text
  if (tone === 'up') return text
  if (tone === 'stressed' || tone === 'low') {
    // Drop exclamation-heavy urgency; add a gentler lead-in once.
    const softened = text.replace(/!+/g, '.').replace(/\bWant one\?/i, 'Want one when you’re ready?')
    if (/^(you’re|you are|you spent)/i.test(softened)) {
      return `No pressure. ${softened.charAt(0).toLowerCase()}${softened.slice(1)}`
    }
    return softened
  }
  return text
}

/** Instruction fragment for the chat system prompt. */
export function moodPromptFragment(tone: MoodTone | null): string {
  if (!tone || tone === 'ok') return ''
  if (tone === 'up') {
    return `\nThe user has been feeling upbeat lately. Celebrate wins briefly; it's fine to lean into goals.`
  }
  if (tone === 'stressed') {
    return `\nThe user has been feeling stressed about money. Prefer reassurance over alerts. Only suggest parking or buffering money when cash remains. Ask fewer questions. Never guilt-trip.`
  }
  return `\nThe user has been feeling low. Keep replies short and kind. Skip optional tips unless they ask.`
}
