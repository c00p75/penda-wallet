import { computePactStatus, type PactStatus } from '@/features/pacts/pactStatus'
import type { CommitmentPact } from '@/features/pacts/types'
import type { Transaction } from '@/features/transactions/types'

export type PactFollowUpKind = 'midpoint' | 'end' | 'broken'

export interface PactFollowUp {
  pactId: string
  description: string
  kind: PactFollowUpKind
  status: PactStatus
  message: string
  /** Stable dedupe key for notifications / checkins. */
  dedupeKey: string
}

/**
 * Active pacts that deserve a companion check-in: midpoint of the window,
 * the end date, or freshly broken.
 */
export function detectPactFollowUps(opts: {
  pacts: CommitmentPact[]
  transactions: Transaction[]
  now?: Date
}): PactFollowUp[] {
  const now = opts.now ?? new Date()
  const today = now.toISOString().slice(0, 10)
  const out: PactFollowUp[] = []

  for (const pact of opts.pacts) {
    const { status } = computePactStatus(pact, opts.transactions, now)
    const start = Date.parse(`${pact.start_date}T00:00:00Z`)
    const end = Date.parse(`${pact.end_date}T00:00:00Z`)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue

    const mid = new Date((start + end) / 2).toISOString().slice(0, 10)

    if (status === 'broken') {
      out.push({
        pactId: pact.id,
        description: pact.description,
        kind: 'broken',
        status,
        message: `Your pact "${pact.description}" got tested. Want to reset it, or talk through what happened?`,
        dedupeKey: `pact-follow:${pact.id}:broken:${today}`,
      })
      continue
    }

    if (status === 'active' && today === mid) {
      out.push({
        pactId: pact.id,
        description: pact.description,
        kind: 'midpoint',
        status,
        message: `Halfway through "${pact.description}". Still holding? Tap Kept it, Slipped, or Not now.`,
        dedupeKey: `pact-follow:${pact.id}:mid:${mid}`,
      })
      continue
    }

    // On the end date the status is still "active" (kept only after the day passes).
    if (status === 'active' && today === pact.end_date) {
      out.push({
        pactId: pact.id,
        description: pact.description,
        kind: 'end',
        status: 'kept',
        message: `You made it through "${pact.description}". Want to celebrate or set the next one?`,
        dedupeKey: `pact-follow:${pact.id}:end:${pact.end_date}`,
      })
    }
  }

  return out
}

export type PactReply = 'kept' | 'slipped' | 'later'

export function parsePactFollowUpReply(text: string): PactReply | null {
  const t = text.trim().toLowerCase()
  if (!t) return null
  if (/^(kept|kept it|held|holding|yes|still on it)\b/.test(t)) return 'kept'
  if (/^(slipped|broke|broke it|no|failed|messed)\b/.test(t)) return 'slipped'
  if (/^(later|not now|skip|dismiss)\b/.test(t)) return 'later'
  return null
}

/** Impulse pause due for a companion follow-up (until elapsed). */
export function impulseDueForFollowUp(
  paused: Array<{ id: string; until: number; merchant: string | null; amountMinor: number }>,
  nowMs = Date.now(),
): Array<{ id: string; message: string; dedupeKey: string }> {
  return paused
    .filter((p) => p.until <= nowMs)
    .map((p) => ({
      id: p.id,
      message: p.merchant
        ? `You paused ${p.merchant} yesterday. Still want it, or glad you waited?`
        : `You paused a big purchase yesterday. Still want it, or glad you waited?`,
      dedupeKey: `impulse-follow:${p.id}`,
    }))
}
