import type { Transaction } from '@/features/transactions/types'

export interface BudgetSuggestion {
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  /** Rounded average monthly spend over the window. */
  monthlyAverageMinor: number
  /** The proposed monthly budget (average rounded up to a clean step). */
  suggestedAmountMinor: number
  transactionCount: number
}

export interface SuggestBudgetsOptions {
  now?: Date
  /** Months of history to average over. */
  months?: number
  /** Rounding step for the suggested amount, in minor units. */
  step?: number
  /** Ignore categories whose total spend over the window is below this. */
  minTotalMinor?: number
  /** Categories that already have a budget — skipped so we don't duplicate. */
  existingCategoryIds?: Iterable<string>
}

interface Bucket {
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  totalMinor: number
  count: number
}

/**
 * Propose per-category monthly budgets from recent spending. Only categories
 * with a repeated, non-trivial pattern are suggested, so the list reads as
 * "here's what you actually spend" rather than noise.
 */
export function suggestBudgets(
  transactions: Transaction[],
  options: SuggestBudgetsOptions = {},
): BudgetSuggestion[] {
  const now = options.now ?? new Date()
  const months = options.months ?? 3
  const step = options.step ?? 1000
  const minTotalMinor = options.minTotalMinor ?? 5000
  const existing = new Set(options.existingCategoryIds ?? [])

  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const buckets = new Map<string, Bucket>()
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    if (!tx.category_id || !tx.category) continue
    if (tx.transaction_date < cutoffStr) continue
    if (existing.has(tx.category_id)) continue

    const bucket = buckets.get(tx.category_id) ?? {
      categoryId: tx.category_id,
      categoryName: tx.category.name,
      categoryIcon: tx.category.icon,
      totalMinor: 0,
      count: 0,
    }
    bucket.totalMinor += tx.amount_minor
    bucket.count += 1
    buckets.set(tx.category_id, bucket)
  }

  const suggestions: BudgetSuggestion[] = []
  for (const bucket of buckets.values()) {
    // Require a repeated pattern, not a one-off, and meaningful spend.
    if (bucket.count < 2 || bucket.totalMinor < minTotalMinor) continue
    const avg = bucket.totalMinor / months
    suggestions.push({
      categoryId: bucket.categoryId,
      categoryName: bucket.categoryName,
      categoryIcon: bucket.categoryIcon,
      monthlyAverageMinor: Math.round(avg),
      suggestedAmountMinor: Math.ceil(avg / step) * step,
      transactionCount: bucket.count,
    })
  }

  return suggestions.sort((a, b) => b.suggestedAmountMinor - a.suggestedAmountMinor)
}
