import type { Transaction } from '@/features/transactions/types'

/**
 * When a large cash-in lands and income looks irregular, suggest parking part
 * of it in a buffer for next month (roadmap "Buffer Engine").
 */
export function suggestBufferFromIncome(
  transactions: Transaction[],
  opts?: { now?: Date; largeFrac?: number },
): { incomeTx: Transaction; suggestMinor: number } | null {
  const now = opts?.now ?? new Date()
  const largeFrac = opts?.largeFrac ?? 0.35
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const incomes = transactions
    .filter((t) => t.type === 'income' && t.transaction_date.startsWith(monthPrefix))
    .sort((a, b) => b.amount_minor - a.amount_minor)
  if (incomes.length === 0) return null

  const total = incomes.reduce((s, t) => s + t.amount_minor, 0)
  const largest = incomes[0]
  if (total <= 0 || largest.amount_minor < total * largeFrac) return null
  if (largest.amount_minor < 50_000) return null

  const suggestMinor = Math.round(largest.amount_minor * 0.3)
  return { incomeTx: largest, suggestMinor }
}
