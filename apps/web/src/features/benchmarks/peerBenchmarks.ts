/**
 * Privacy-preserving soft benchmarks from onboarding income band (no peer data share).
 * Midpoints are illustrative monthly income in minor units (scaled for relative guidance).
 */

export type IncomeBand = 'tight' | 'stable' | 'comfortable' | 'prefer_not_to_say' | string | null | undefined

export interface PeerBenchmark {
  category: string
  /** Suggested monthly share of income (0–1). */
  shareOfIncome: number
  tip: string
}

/** Rough monthly income midpoints (minor) for banding tips. */
const BAND_MIDPOINT_MINOR: Record<string, number> = {
  tight: 80_000,
  stable: 250_000,
  comfortable: 600_000,
}

const DEFAULT_SHARES: PeerBenchmark[] = [
  {
    category: 'Transport',
    shareOfIncome: 0.12,
    tip: 'People in a similar income band often keep transport near this share.',
  },
  {
    category: 'Food',
    shareOfIncome: 0.22,
    tip: 'Groceries + eating out together tend to land around here.',
  },
  {
    category: 'Fun',
    shareOfIncome: 0.08,
    tip: 'A healthy fun envelope without crowding fixed costs.',
  },
  {
    category: 'Savings',
    shareOfIncome: 0.15,
    tip: 'Aim to park at least this much before lifestyle expands.',
  },
]

export function incomeMidpointMinor(band: IncomeBand): number | null {
  if (!band || !(band in BAND_MIDPOINT_MINOR)) return null
  return BAND_MIDPOINT_MINOR[band]!
}

export function peerBenchmarksForBand(
  band: IncomeBand,
): Array<PeerBenchmark & { amountMinor: number }> {
  const mid = incomeMidpointMinor(band)
  if (mid == null) return []
  return DEFAULT_SHARES.map((b) => ({
    ...b,
    amountMinor: Math.round(mid * b.shareOfIncome),
  }))
}

export function compareSpendToBenchmark(
  spentMinor: number,
  benchmarkMinor: number,
): 'under' | 'near' | 'over' {
  if (benchmarkMinor <= 0) return 'near'
  const ratio = spentMinor / benchmarkMinor
  if (ratio < 0.85) return 'under'
  if (ratio > 1.15) return 'over'
  return 'near'
}
