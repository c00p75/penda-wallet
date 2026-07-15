import { describe, expect, it } from 'vitest'
import type { Category } from '@/features/categories/types'
import { starterBudgetsForPersona } from './starterBudgets'

function cat(id: string, name: string, icon: string | null = null): Category {
  return { id, wallet_id: null, name, icon, color: null, parent_category_id: null, is_system: true }
}

const CATEGORIES: Category[] = [
  cat('housing', 'Housing', '🏠'),
  cat('food', 'Food & Drinks', '🍔'),
  cat('transport', 'Transportation', '🚗'),
  cat('utilities', 'Utilities', '💡'),
  cat('entertainment', 'Entertainment', '🎬'),
]

describe('starterBudgetsForPersona', () => {
  it('splits a monthly plan into persona-weighted starter budgets', () => {
    const result = starterBudgetsForPersona('balanced_coach', 1_200_000, CATEGORIES)
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((s) => s.source === 'persona')).toBe(true)
    expect(result.every((s) => s.suggestedAmountMinor > 0)).toBe(true)
    // Weights never sum to 1 — some of the plan stays unbudgeted.
    const total = result.reduce((sum, s) => sum + s.suggestedAmountMinor, 0)
    expect(total).toBeLessThan(1_200_000)
  })

  it('skips categories the wallet does not have and ones already budgeted', () => {
    const noEntertainment = CATEGORIES.filter((c) => c.name !== 'Entertainment')
    const result = starterBudgetsForPersona('balanced_coach', 1_200_000, noEntertainment, ['housing'])
    expect(result.some((s) => s.categoryName === 'Entertainment')).toBe(false)
    expect(result.some((s) => s.categoryId === 'housing')).toBe(false)
  })

  it('gives different personas different emphasis', () => {
    const genZ = starterBudgetsForPersona('gen_z', 1_000_000, CATEGORIES)
    const gogo = starterBudgetsForPersona('gogo', 1_000_000, CATEGORIES)
    const genZEntertainment = genZ.find((s) => s.categoryName === 'Entertainment')?.suggestedAmountMinor ?? 0
    const gogoEntertainment = gogo.find((s) => s.categoryName === 'Entertainment')?.suggestedAmountMinor ?? 0
    expect(genZEntertainment).toBeGreaterThan(gogoEntertainment)
  })

  it('returns nothing for a zero or negative plan amount', () => {
    expect(starterBudgetsForPersona('balanced_coach', 0, CATEGORIES)).toEqual([])
    expect(starterBudgetsForPersona('balanced_coach', -500, CATEGORIES)).toEqual([])
  })
})
