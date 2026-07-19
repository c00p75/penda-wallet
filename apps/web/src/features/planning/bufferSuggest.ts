import type { Transaction } from '@/features/transactions/types'
import { remainingFromCashInMinor } from './walletBalance'

const MIN_INCOME_MINOR = 50_000
/** Don't bother suggesting a buffer park below this (e.g. ZMW 50). */
const MIN_SUGGEST_MINOR = 5_000

export interface BufferSuggestOpts {
  now?: Date
  largeFrac?: number
  /**
   * Current wallet balance. When provided, the suggestion is capped to what
   * the user can actually move, and suppressed when cash is already gone.
   */
  availableBalanceMinor?: number
}

/**
 * When a large cash-in lands and income looks irregular, suggest parking part
 * of it in a buffer for next month (roadmap "Buffer Engine").
 *
 * Suppresses the nudge once that cash-in has already been spent down, or when
 * the wallet balance can't cover the suggested park.
 */
export function suggestBufferFromIncome(
  transactions: Transaction[],
  opts?: BufferSuggestOpts,
): { incomeTx: Transaction; suggestMinor: number } | null {
  const now = opts?.now ?? new Date()
  const largeFrac = opts?.largeFrac ?? 0.35
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const incomes = transactions
    .filter((t) => t.type === 'income' && t.transaction_date.startsWith(monthPrefix))
    .sort((a, b) => {
      const aAmt = a.converted_amount_minor ?? a.amount_minor
      const bAmt = b.converted_amount_minor ?? b.amount_minor
      return bAmt - aAmt
    })
  if (incomes.length === 0) return null

  const total = incomes.reduce((s, t) => s + (t.converted_amount_minor ?? t.amount_minor), 0)
  const largest = incomes[0]
  const incomeAmt = largest.converted_amount_minor ?? largest.amount_minor
  if (total <= 0 || incomeAmt < total * largeFrac) return null
  if (incomeAmt < MIN_INCOME_MINOR) return null

  let headroom = remainingFromCashInMinor(transactions, largest, { now })
  if (opts?.availableBalanceMinor != null) {
    headroom = Math.min(headroom, opts.availableBalanceMinor)
  }
  if (headroom <= 0) return null

  const ideal = Math.round(incomeAmt * 0.3)
  const suggestMinor = Math.min(ideal, Math.round(headroom))
  if (suggestMinor < MIN_SUGGEST_MINOR) return null

  return { incomeTx: largest, suggestMinor }
}
