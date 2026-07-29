import type { Category } from '@/features/categories/types'
import type { Transaction } from '@/features/transactions/types'
import type { SavingsGoal } from '@/features/goals/types'
import { totalMonthlyGoalReserve } from '@/features/goals/goalContribution'
import { suggestBudgets, type BudgetSuggestion } from './suggestBudgets'

export type BudgetStrategyId = 'fifty_thirty_twenty' | 'needs_wants_savings' | 'zero_based' | 'pay_yourself_first'

export interface StrategyResult {
  suggestions: BudgetSuggestion[]
  /** Informational only, there's no "Savings" spend category, so this is never created as a budget row. */
  savingsReserveMinor: number
}

interface BucketAllocation {
  /** Matched against the wallet's category name (system categories are seeded with these exact names). */
  categoryName: string
  /** Share of the bucket's amount suggested for this category. */
  weight: number
}

// Weights within each bucket sum to 1.0, so a bucket's full share always
// distributes across its categories (unlike starterBudgets' persona weights,
// which deliberately under-allocate).
const NEEDS_CATEGORIES: BucketAllocation[] = [
  { categoryName: 'Housing', weight: 0.42 },
  { categoryName: 'Food & Drinks', weight: 0.13 },
  { categoryName: 'Transportation', weight: 0.18 },
  { categoryName: 'Utilities', weight: 0.15 },
  { categoryName: 'Health', weight: 0.12 },
]

const WANTS_CATEGORIES: BucketAllocation[] = [
  { categoryName: 'Shopping', weight: 0.55 },
  { categoryName: 'Entertainment', weight: 0.45 },
]

/** Rounding step for suggested amounts, in minor units, matches suggestBudgets' default. */
const STEP = 1000

function splitBucket(
  bucketMinor: number,
  allocations: BucketAllocation[],
  categories: Category[],
  existing: Set<string>,
): BudgetSuggestion[] {
  if (bucketMinor <= 0) return []
  const suggestions: BudgetSuggestion[] = []
  for (const { categoryName, weight } of allocations) {
    const category = categories.find((c) => c.name === categoryName)
    if (!category || existing.has(category.id)) continue
    const amount = Math.round((bucketMinor * weight) / STEP) * STEP
    if (amount <= 0) continue
    suggestions.push({
      categoryId: category.id,
      categoryName: category.name,
      categoryIcon: category.icon,
      monthlyAverageMinor: 0,
      suggestedAmountMinor: amount,
      transactionCount: 0,
      source: 'strategy',
    })
  }
  return suggestions
}

/** Proportionally rescales suggestions so they sum to exactly targetMinor, the last item absorbs the rounding remainder. */
function rescaleToExact(suggestions: BudgetSuggestion[], targetMinor: number): BudgetSuggestion[] {
  if (suggestions.length === 0 || targetMinor <= 0) return []
  const currentTotal = suggestions.reduce((sum, s) => sum + s.suggestedAmountMinor, 0)
  if (currentTotal <= 0) return []

  let allocated = 0
  return suggestions.map((s, i) => {
    if (i === suggestions.length - 1) {
      return { ...s, suggestedAmountMinor: targetMinor - allocated }
    }
    const amount = Math.round((s.suggestedAmountMinor / currentTotal) * targetMinor / STEP) * STEP
    allocated += amount
    return { ...s, suggestedAmountMinor: amount }
  })
}

/**
 * 50/30/20 is just this function called with the default ratio, one engine,
 * two entry points, since a customizable Needs/Wants/Savings split is the
 * same math with different percentages.
 */
export function needsWantsSavingsStrategy(
  planAmountMinor: number,
  categories: Category[],
  existingCategoryIds: Iterable<string> = [],
  ratio: { needs: number; wants: number; savings: number } = { needs: 0.5, wants: 0.3, savings: 0.2 },
): StrategyResult {
  if (planAmountMinor <= 0) return { suggestions: [], savingsReserveMinor: 0 }
  const existing = new Set(existingCategoryIds)
  const needsMinor = Math.round(planAmountMinor * ratio.needs)
  const wantsMinor = Math.round(planAmountMinor * ratio.wants)
  const savingsReserveMinor = Math.round(planAmountMinor * ratio.savings)

  const suggestions = [
    ...splitBucket(needsMinor, NEEDS_CATEGORIES, categories, existing),
    ...splitBucket(wantsMinor, WANTS_CATEGORIES, categories, existing),
  ]

  return { suggestions, savingsReserveMinor }
}

/**
 * Every unit assigned a job, nothing left over: savings reserve comes off
 * the top (capped to what goals actually need), then the remainder is split
 * across categories, using real spending history when there's any, and the
 * needs/wants weight tables otherwise, then rescaled so the total lands
 * exactly on the remainder rather than under/over by a rounding step.
 */
export function zeroBasedStrategy(
  planAmountMinor: number,
  categories: Category[],
  transactions: Transaction[],
  goals: SavingsGoal[],
  existingCategoryIds: Iterable<string> = [],
  now: Date = new Date(),
): StrategyResult {
  if (planAmountMinor <= 0) return { suggestions: [], savingsReserveMinor: 0 }
  const existing = new Set(existingCategoryIds)
  const savingsReserveMinor = Math.min(totalMonthlyGoalReserve(goals, now), planAmountMinor)
  const remainderMinor = planAmountMinor - savingsReserveMinor

  const history = suggestBudgets(transactions, { now, existingCategoryIds: existing }).map((s) => ({
    ...s,
    source: 'strategy' as const,
  }))
  const base =
    history.length > 0
      ? history
      : [
          ...splitBucket(remainderMinor * 0.7, NEEDS_CATEGORIES, categories, existing),
          ...splitBucket(remainderMinor * 0.3, WANTS_CATEGORIES, categories, existing),
        ]

  return { suggestions: rescaleToExact(base, remainderMinor), savingsReserveMinor }
}

/**
 * Save off the top, spend the rest freely, deliberately no per-category
 * split, that's the whole point of Pay Yourself First. Produces at most one
 * "Overall" envelope for what's left after savings.
 */
export function payYourselfFirstStrategy(
  planAmountMinor: number,
  goals: SavingsGoal[],
  payYourselfFirstPct: number,
  hasOverallBudget: boolean,
  now: Date = new Date(),
): StrategyResult {
  if (planAmountMinor <= 0) return { suggestions: [], savingsReserveMinor: 0 }

  // The profile's pay_yourself_first_pct defaults to 0 ("off") for its
  // unrelated auto-post feature, so a 0 here must fall back rather than
  // zero out savings. Prefer a percentage that actually covers goal
  // contributions over a flat guess when there's a real signal for one.
  let pct = payYourselfFirstPct
  if (pct <= 0) {
    const goalReserveMinor = totalMonthlyGoalReserve(goals, now)
    pct =
      goalReserveMinor > 0
        ? Math.min(50, Math.max(5, Math.round((goalReserveMinor / planAmountMinor) * 100)))
        : 20
  }

  const savingsReserveMinor = Math.round((planAmountMinor * pct) / 100)
  if (hasOverallBudget) return { suggestions: [], savingsReserveMinor }

  const remainderMinor = planAmountMinor - savingsReserveMinor
  if (remainderMinor <= 0) return { suggestions: [], savingsReserveMinor }

  return {
    suggestions: [
      {
        categoryId: null,
        categoryName: 'Overall (all categories)',
        categoryIcon: null,
        monthlyAverageMinor: 0,
        suggestedAmountMinor: remainderMinor,
        transactionCount: 0,
        source: 'strategy',
      },
    ],
    savingsReserveMinor,
  }
}
