import type { AiPersonality } from '@/features/profile/types'
import { resolveAiPersonality } from '@/features/profile/types'
import type { Category } from '@/features/categories/types'
import type { BudgetSuggestion } from './suggestBudgets'

interface StarterAllocation {
  /** Matched against the wallet's category name (system categories are seeded with these exact names). */
  categoryName: string
  /** Share of the monthly plan amount suggested for this category. */
  weight: number
}

/**
 * Each AI persona's natural money emphasis, as a share of a monthly spending
 * plan. Weights deliberately don't sum to 1, the remainder stays
 * unbudgeted so a cold-start user isn't locked into a rigid split on day
 * one. Lets a brand-new wallet with zero transaction history (where
 * suggestBudgets has nothing to learn from) still get a sensible starting
 * point instead of staring at zero.
 */
const STARTER_ALLOCATIONS: Record<
  ReturnType<typeof resolveAiPersonality>,
  StarterAllocation[]
> = {
  balanced_coach: [
    { categoryName: 'Housing', weight: 0.35 },
    { categoryName: 'Food & Drinks', weight: 0.2 },
    { categoryName: 'Transportation', weight: 0.1 },
    { categoryName: 'Utilities', weight: 0.08 },
    { categoryName: 'Entertainment', weight: 0.07 },
  ],
  angry_mom: [
    { categoryName: 'Housing', weight: 0.35 },
    { categoryName: 'Food & Drinks', weight: 0.25 },
    { categoryName: 'Utilities', weight: 0.1 },
    { categoryName: 'Health', weight: 0.08 },
  ],
  drill_sergeant: [
    { categoryName: 'Housing', weight: 0.28 },
    { categoryName: 'Food & Drinks', weight: 0.14 },
    { categoryName: 'Utilities', weight: 0.08 },
    { categoryName: 'Transportation', weight: 0.08 },
  ],
  funny_comedian: [
    { categoryName: 'Housing', weight: 0.3 },
    { categoryName: 'Food & Drinks', weight: 0.18 },
    { categoryName: 'Entertainment', weight: 0.12 },
  ],
  hustler: [
    { categoryName: 'Housing', weight: 0.28 },
    { categoryName: 'Food & Drinks', weight: 0.14 },
    { categoryName: 'Transportation', weight: 0.12 },
    { categoryName: 'Utilities', weight: 0.07 },
  ],
  analyst: [
    { categoryName: 'Housing', weight: 0.3 },
    { categoryName: 'Food & Drinks', weight: 0.15 },
    { categoryName: 'Transportation', weight: 0.1 },
    { categoryName: 'Utilities', weight: 0.08 },
    { categoryName: 'Health', weight: 0.05 },
    { categoryName: 'Entertainment', weight: 0.05 },
  ],
}

/** Rounding step for suggested amounts, in minor units, matches suggestBudgets' default. */
const STEP = 1000

export function starterBudgetsForPersona(
  persona: AiPersonality,
  intendedAmountMinor: number,
  categories: Category[],
  existingCategoryIds: Iterable<string> = [],
): BudgetSuggestion[] {
  if (intendedAmountMinor <= 0) return []
  const existing = new Set(existingCategoryIds)
  const allocations =
    STARTER_ALLOCATIONS[resolveAiPersonality(persona)] ?? STARTER_ALLOCATIONS.balanced_coach

  const suggestions: BudgetSuggestion[] = []
  for (const { categoryName, weight } of allocations) {
    const category = categories.find((c) => c.name === categoryName)
    if (!category || existing.has(category.id)) continue
    const amount = Math.round((intendedAmountMinor * weight) / STEP) * STEP
    if (amount <= 0) continue
    suggestions.push({
      categoryId: category.id,
      categoryName: category.name,
      categoryIcon: category.icon,
      monthlyAverageMinor: 0,
      suggestedAmountMinor: amount,
      transactionCount: 0,
      source: 'persona',
    })
  }
  return suggestions
}
