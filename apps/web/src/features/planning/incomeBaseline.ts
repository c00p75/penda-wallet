import type { Transaction } from '@/features/transactions/types'

export interface IncomeBaseline {
  monthsConsidered: number
  monthlyIncomesMinor: number[]
  averageMinor: number
  minMinor: number
  /** Coefficient of variation across the considered months. */
  variability: number
  /** True once month-to-month income swings enough to make the average unsafe to plan against. */
  isIrregular: boolean
  /**
   * What a plan should actually be sized against: the lowest recent month
   * when income is irregular (so a lean month doesn't catch the plan out),
   * the rolling average otherwise.
   */
  conservativeMinor: number
}

/** Coefficient of variation above which income is treated as irregular rather than just naturally noisy. */
const IRREGULARITY_THRESHOLD = 0.15

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/**
 * Variable/irregular income handling (roadmap bet #11 fast-follow, feeds the
 * candidate "Buffer Engine"): rather than always planning against the
 * average of recent income, fall back to a conservative baseline (the
 * lowest of the last few months) once income actually swings enough that
 * the average would overstate what's reliably there.
 */
export function computeIncomeBaseline(
  transactions: Transaction[],
  now: Date = new Date(),
  months = 3,
): IncomeBaseline | null {
  const currentMonth = monthKey(now.toISOString())
  const byMonth = new Map<string, number>()

  for (const tx of transactions) {
    if (tx.type !== 'income') continue
    const key = monthKey(tx.transaction_date)
    if (key >= currentMonth) continue // exclude the current, still-incomplete month
    byMonth.set(key, (byMonth.get(key) ?? 0) + tx.amount_minor)
  }

  const sortedMonths = [...byMonth.keys()].sort().reverse().slice(0, months)
  if (sortedMonths.length < 2) return null // not enough history to say anything meaningful

  const monthlyIncomesMinor = sortedMonths.map((key) => byMonth.get(key)!).reverse()
  const averageMinor = monthlyIncomesMinor.reduce((sum, v) => sum + v, 0) / monthlyIncomesMinor.length
  const minMinor = Math.min(...monthlyIncomesMinor)

  const variance =
    monthlyIncomesMinor.reduce((sum, v) => sum + (v - averageMinor) ** 2, 0) / monthlyIncomesMinor.length
  const variability = averageMinor > 0 ? Math.sqrt(variance) / averageMinor : 0
  const isIrregular = variability > IRREGULARITY_THRESHOLD

  return {
    monthsConsidered: monthlyIncomesMinor.length,
    monthlyIncomesMinor,
    averageMinor: Math.round(averageMinor),
    minMinor,
    variability,
    isIrregular,
    conservativeMinor: Math.round(isIrregular ? minMinor : averageMinor),
  }
}
