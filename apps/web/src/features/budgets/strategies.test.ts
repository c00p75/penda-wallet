import { describe, expect, it } from 'vitest'
import type { Category } from '@/features/categories/types'
import type { Transaction } from '@/features/transactions/types'
import type { SavingsGoal } from '@/features/goals/types'
import { needsWantsSavingsStrategy, zeroBasedStrategy, payYourselfFirstStrategy } from './strategies'

const NOW = new Date('2026-07-14T10:00:00Z')

function cat(id: string, name: string, icon: string | null = null): Category {
  return { id, wallet_id: null, name, icon, color: null, parent_category_id: null, is_system: true }
}

const CATEGORIES: Category[] = [
  cat('housing', 'Housing', '🏠'),
  cat('food', 'Food & Drinks', '🍔'),
  cat('transport', 'Transportation', '🚗'),
  cat('utilities', 'Utilities', '💡'),
  cat('health', 'Health', '❤️'),
  cat('shopping', 'Shopping', '🛍️'),
  cat('entertainment', 'Entertainment', '🎬'),
]

let seq = 0
function tx(overrides: Partial<Transaction> & { amount_minor: number; transaction_date: string }): Transaction {
  seq += 1
  return {
    id: `tx-${seq}`,
    wallet_id: 'w1',
    created_by: 'u1',
    category_id: overrides.category?.id ?? overrides.category_id ?? null,
    currency: 'ZMW',
    type: 'expense',
    merchant: null,
    description: null,
    source: 'manual',
    receipt_storage_path: null,
    ai_extraction: null,
    user_confirmed: true,
    version: 1,
    deleted_at: null,
    created_at: overrides.transaction_date,
    updated_at: overrides.transaction_date,
    category: null,
    ...overrides,
  } as Transaction
}

function goal(
  overrides: Partial<SavingsGoal> & {
    target_amount_minor: number
    current_amount_minor: number
    target_date: string | null
  },
): SavingsGoal {
  return {
    id: 'goal-1',
    wallet_id: 'w1',
    name: 'Test goal',
    icon: null,
    image_path: null,
    motivation: null,
    assigned_member_id: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('needsWantsSavingsStrategy', () => {
  it('splits a plan 50/30/20 by default across the needs/wants weight tables', () => {
    const result = needsWantsSavingsStrategy(1_000_000, CATEGORIES)
    expect(result.savingsReserveMinor).toBe(200_000)
    const total = result.suggestions.reduce((sum, s) => sum + s.suggestedAmountMinor, 0)
    expect(total).toBe(800_000)
    expect(result.suggestions.every((s) => s.source === 'strategy')).toBe(true)
  })

  it('accepts a custom ratio', () => {
    const result = needsWantsSavingsStrategy(1_000_000, CATEGORIES, [], { needs: 0.4, wants: 0.4, savings: 0.2 })
    expect(result.savingsReserveMinor).toBe(200_000)
    const total = result.suggestions.reduce((sum, s) => sum + s.suggestedAmountMinor, 0)
    expect(total).toBe(800_000)
  })

  it('skips categories the wallet does not have and ones already budgeted', () => {
    const noEntertainment = CATEGORIES.filter((c) => c.name !== 'Entertainment')
    const result = needsWantsSavingsStrategy(1_000_000, noEntertainment, ['housing'])
    expect(result.suggestions.some((s) => s.categoryName === 'Entertainment')).toBe(false)
    expect(result.suggestions.some((s) => s.categoryId === 'housing')).toBe(false)
  })

  it('returns nothing for a zero or negative plan amount', () => {
    expect(needsWantsSavingsStrategy(0, CATEGORIES)).toEqual({ suggestions: [], savingsReserveMinor: 0 })
    expect(needsWantsSavingsStrategy(-500, CATEGORIES)).toEqual({ suggestions: [], savingsReserveMinor: 0 })
  })
})

describe('zeroBasedStrategy', () => {
  it('assigns every unit of the plan a job when there is no spending history', () => {
    const goals = [goal({ target_amount_minor: 500_000, current_amount_minor: 0, target_date: '2026-12-14' })]
    const result = zeroBasedStrategy(1_000_000, CATEGORIES, [], goals, [], NOW)
    // required monthly contribution: ceil(500000 / 5 months) = 100000
    expect(result.savingsReserveMinor).toBe(100_000)
    const total = result.suggestions.reduce((sum, s) => sum + s.suggestedAmountMinor, 0)
    expect(result.savingsReserveMinor + total).toBe(1_000_000)
  })

  it('bases the split on real spending history when it exists, still summing exactly', () => {
    const txns = [
      tx({ category: CATEGORIES[0], amount_minor: 150_000, transaction_date: '2026-05-01' }),
      tx({ category: CATEGORIES[0], amount_minor: 150_000, transaction_date: '2026-06-01' }),
      tx({ category: CATEGORIES[0], amount_minor: 150_000, transaction_date: '2026-07-01' }),
      tx({ category: CATEGORIES[1], amount_minor: 20_000, transaction_date: '2026-05-01' }),
      tx({ category: CATEGORIES[1], amount_minor: 20_000, transaction_date: '2026-06-01' }),
      tx({ category: CATEGORIES[1], amount_minor: 20_000, transaction_date: '2026-07-01' }),
    ]
    const result = zeroBasedStrategy(1_000_000, CATEGORIES, txns, [], [], NOW)
    expect(result.suggestions.length).toBeGreaterThan(0)
    const total = result.suggestions.reduce((sum, s) => sum + s.suggestedAmountMinor, 0)
    expect(result.savingsReserveMinor + total).toBe(1_000_000)
  })

  it('caps the savings reserve at the plan amount when goals need more than the whole plan', () => {
    const goals = [goal({ target_amount_minor: 10_000_000, current_amount_minor: 0, target_date: '2026-08-14' })]
    const result = zeroBasedStrategy(1_000_000, CATEGORIES, [], goals, [], NOW)
    expect(result.savingsReserveMinor).toBe(1_000_000)
    expect(result.suggestions).toEqual([])
  })

  it('returns nothing for a zero or negative plan amount', () => {
    expect(zeroBasedStrategy(0, CATEGORIES, [], [], [], NOW)).toEqual({ suggestions: [], savingsReserveMinor: 0 })
  })
})

describe('payYourselfFirstStrategy', () => {
  it('reserves the given percentage and proposes one overall envelope for the rest', () => {
    const result = payYourselfFirstStrategy(1_000_000, [], 20, false, NOW)
    expect(result.savingsReserveMinor).toBe(200_000)
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0]).toMatchObject({
      categoryId: null,
      categoryName: 'Overall (all categories)',
      suggestedAmountMinor: 800_000,
      source: 'strategy',
    })
  })

  it('falls back to 20% when no percentage is set and there are no goals', () => {
    const result = payYourselfFirstStrategy(1_000_000, [], 0, false, NOW)
    expect(result.savingsReserveMinor).toBe(200_000)
  })

  it('derives a percentage from goal contributions when no percentage is set', () => {
    const goals = [goal({ target_amount_minor: 500_000, current_amount_minor: 0, target_date: '2026-12-14' })]
    // required monthly contribution: 100000 of a 1,000,000 plan -> 10%
    const result = payYourselfFirstStrategy(1_000_000, goals, 0, false, NOW)
    expect(result.savingsReserveMinor).toBe(100_000)
  })

  it('produces no envelope, but still reserves savings, when an overall budget already exists', () => {
    const result = payYourselfFirstStrategy(1_000_000, [], 20, true, NOW)
    expect(result.savingsReserveMinor).toBe(200_000)
    expect(result.suggestions).toEqual([])
  })

  it('returns nothing for a zero or negative plan amount', () => {
    expect(payYourselfFirstStrategy(0, [], 20, false, NOW)).toEqual({ suggestions: [], savingsReserveMinor: 0 })
  })
})
