import { localDateStr, parseLocalDate } from '@/lib/dates'
import type { Transaction, TransactionType } from '@/features/transactions/types'
import type { BucketGranularity, DateRange } from './period'
import type { CategoryTotal } from './types'

/** Transactions whose calendar date falls within `range` (inclusive on both ends). */
export function filterByRange(transactions: Transaction[], range: DateRange): Transaction[] {
  return transactions.filter((tx) => tx.transaction_date >= range.start && tx.transaction_date <= range.end)
}

export function sumByType(transactions: Transaction[], type: TransactionType): number {
  return transactions.reduce(
    (sum, tx) => (tx.type === type ? sum + (tx.converted_amount_minor ?? tx.amount_minor) : sum),
    0,
  )
}

/** Top `topN` categories by total, remainder merged into a trailing "Other" bucket. */
export function categoryTotals(
  transactions: Transaction[],
  type: 'expense' | 'income',
  topN = 7,
): CategoryTotal[] {
  const totals = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.type !== type) continue
    const name = tx.category?.name ?? 'Uncategorized'
    totals.set(name, (totals.get(name) ?? 0) + (tx.converted_amount_minor ?? tx.amount_minor))
  }

  const sorted = Array.from(totals.entries())
    .map(([category, amount_minor]) => ({ category, amount_minor }))
    .sort((a, b) => b.amount_minor - a.amount_minor)

  if (sorted.length <= topN) return sorted

  const top = sorted.slice(0, topN)
  const otherMinor = sorted.slice(topN).reduce((sum, c) => sum + c.amount_minor, 0)
  return [...top, { category: 'Other', amount_minor: otherMinor }]
}

export interface CashflowBucket {
  key: string
  label: string
  incomeMinor: number
  expenseMinor: number
}

/** Income/expense totals bucketed across `range` at `granularity`, including empty buckets. */
export function bucketCashflow(
  transactions: Transaction[],
  range: DateRange,
  granularity: BucketGranularity,
): CashflowBucket[] {
  const buckets = new Map<string, CashflowBucket>()
  const rangeStart = parseLocalDate(range.start)
  const rangeEnd = parseLocalDate(range.end)

  if (granularity === 'month') {
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
    while (cursor <= rangeEnd) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      const label = cursor.toLocaleDateString(undefined, {
        month: 'short',
        ...(cursor.getFullYear() !== rangeEnd.getFullYear() ? { year: '2-digit' } : {}),
      })
      buckets.set(key, { key, label, incomeMinor: 0, expenseMinor: 0 })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  } else {
    const stepDays = granularity === 'week' ? 7 : 1
    const cursor = new Date(rangeStart)
    while (cursor <= rangeEnd) {
      const key = localDateStr(cursor)
      const label = cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      buckets.set(key, { key, label, incomeMinor: 0, expenseMinor: 0 })
      cursor.setDate(cursor.getDate() + stepDays)
    }
  }

  const bucketKeys = Array.from(buckets.keys())

  function keyFor(dateStr: string): string {
    if (granularity === 'month') return dateStr.slice(0, 7)
    if (granularity === 'day') return dateStr
    let match = bucketKeys[0]
    for (const k of bucketKeys) {
      if (k <= dateStr) match = k
      else break
    }
    return match
  }

  for (const tx of transactions) {
    if (tx.type !== 'income' && tx.type !== 'expense') continue
    if (tx.transaction_date < range.start || tx.transaction_date > range.end) continue
    const bucket = buckets.get(keyFor(tx.transaction_date))
    if (!bucket) continue
    const amount = tx.converted_amount_minor ?? tx.amount_minor
    if (tx.type === 'income') bucket.incomeMinor += amount
    else bucket.expenseMinor += amount
  }

  return Array.from(buckets.values())
}
