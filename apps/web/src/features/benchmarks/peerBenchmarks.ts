/**
 * Privacy-preserving soft benchmarks: illustrative healthy spending shares for
 * the user, scaled off their OWN income when we have it (no peer-data sharing,
 * despite the historical "peer" name). Falls back to an income-band midpoint
 * only as a cold-start estimate before enough income is logged.
 */

export type IncomeBand = 'tight' | 'stable' | 'comfortable' | 'prefer_not_to_say' | string | null | undefined

export interface PeerBenchmark {
  category: string
  /** Suggested monthly share of income (0–1). */
  shareOfIncome: number
  tip: string
  /**
   * Lowercase substrings matched against the user's real category names. The
   * old code derived this from the label's first word, which silently never
   * matched (e.g. "Fun" vs the seeded "Entertainment" category) and left those
   * rows permanently reading "you're under". Explicit keywords keep the
   * comparison honest as category names evolve.
   */
  matchKeywords: string[]
}

/** Rough monthly income midpoints (minor) used only when real income is unknown. */
const BAND_MIDPOINT_MINOR: Record<string, number> = {
  tight: 80_000,
  stable: 250_000,
  comfortable: 600_000,
}

// Only categories that correspond to real, comparable EXPENSE spending. Savings
// is deliberately not here: it isn't an expense category, so comparing "spent
// on savings" was always 0 and always "under". Savings guidance lives in the
// salary plan / goals surfaces instead.
const DEFAULT_SHARES: PeerBenchmark[] = [
  {
    category: 'Transport',
    shareOfIncome: 0.12,
    matchKeywords: ['transport', 'commut', 'fuel', 'petrol', 'transit'],
    tip: 'A common healthy share for getting around.',
  },
  {
    category: 'Food',
    shareOfIncome: 0.22,
    matchKeywords: ['food', 'grocer', 'dining', 'restaurant', 'eat', 'drink'],
    tip: 'Groceries plus eating out usually land around here.',
  },
  {
    category: 'Fun',
    shareOfIncome: 0.1,
    matchKeywords: ['entertainment', 'fun', 'leisure', 'shopping', 'nightlife'],
    tip: 'Room for fun without crowding the essentials.',
  },
]

export function incomeMidpointMinor(band: IncomeBand): number | null {
  if (!band || !(band in BAND_MIDPOINT_MINOR)) return null
  return BAND_MIDPOINT_MINOR[band]!
}

/**
 * Benchmark amounts for the user. Prefers their actual monthly income; falls
 * back to the band midpoint as a cold-start estimate. Returns [] when we have
 * neither a real income figure nor a known band.
 */
export function peerBenchmarksForBand(
  band: IncomeBand,
  actualMonthlyIncomeMinor?: number,
): Array<PeerBenchmark & { amountMinor: number }> {
  const base =
    actualMonthlyIncomeMinor && actualMonthlyIncomeMinor > 0
      ? actualMonthlyIncomeMinor
      : incomeMidpointMinor(band)
  if (base == null || base <= 0) return []
  return DEFAULT_SHARES.map((b) => ({
    ...b,
    amountMinor: Math.round(base * b.shareOfIncome),
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
