import type { Transaction } from '@/features/transactions/types'

export type RetroPace = 'under' | 'over' | 'on-target'

export interface PeriodRetro {
  monthStart: string
  intendedMinor: number
  spentMinor: number
  /** intended - spent; positive means the period landed under plan. */
  deltaMinor: number
  pace: RetroPace
}

function monthEndOf(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/** Within this fraction of the intended amount, a period counts as "on target" rather than meaningfully under/over. */
const ON_TARGET_TOLERANCE = 0.03

/**
 * The end-of-period recap that seeds the next plan (roadmap bet #11 /
 * ties into the bet #2 rituals cadence): how the just-finished month
 * actually went against its intention, computed straight from transactions
 * rather than requiring the user to look it up themselves.
 */
export function computeRetro(
  intendedMinor: number,
  monthStart: string,
  transactions: Transaction[],
): PeriodRetro {
  const monthEnd = monthEndOf(monthStart)
  const spentMinor = transactions
    .filter((tx) => tx.type === 'expense' && tx.transaction_date >= monthStart && tx.transaction_date <= monthEnd)
    .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)

  const deltaMinor = intendedMinor - spentMinor
  const pace: RetroPace =
    Math.abs(deltaMinor) <= intendedMinor * ON_TARGET_TOLERANCE ? 'on-target' : deltaMinor > 0 ? 'under' : 'over'

  return { monthStart, intendedMinor, spentMinor, deltaMinor, pace }
}

/** monthStart ('YYYY-MM-01') for the calendar month immediately before the given one. */
export function previousMonthStart(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}
