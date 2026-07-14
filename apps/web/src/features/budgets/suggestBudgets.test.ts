import { describe, expect, it } from 'vitest'
import { suggestBudgets } from './suggestBudgets'
import type { Transaction } from '@/features/transactions/types'
import type { Category } from '@/features/categories/types'

const NOW = new Date('2026-07-14T10:00:00Z')

function cat(id: string, name: string, icon: string | null = null): Category {
  return { id, name, icon } as Category
}

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
    user_confirmed: true,
    version: 1,
    deleted_at: null,
    created_at: overrides.transaction_date,
    updated_at: overrides.transaction_date,
    category: null,
    ...overrides,
  } as Transaction
}

const FOOD = cat('food', 'Food & Drinks', '🍔')
const TRANSPORT = cat('transport', 'Transportation', '🚗')
const RENT = cat('rent', 'Housing', '🏠')
const COFFEE = cat('coffee', 'Coffee')

describe('suggestBudgets', () => {
  it('proposes monthly budgets from average spend over the window, biggest first', () => {
    const txns = [
      // Food: 3 txns totalling K630 over 3 months -> avg K210
      tx({ category: FOOD, amount_minor: 20000, transaction_date: '2026-05-01' }),
      tx({ category: FOOD, amount_minor: 25000, transaction_date: '2026-06-01' }),
      tx({ category: FOOD, amount_minor: 18000, transaction_date: '2026-07-01' }),
      // Rent: 3 txns of K1500 -> avg K1500
      tx({ category: RENT, amount_minor: 150000, transaction_date: '2026-04-20' }),
      tx({ category: RENT, amount_minor: 150000, transaction_date: '2026-05-20' }),
      tx({ category: RENT, amount_minor: 150000, transaction_date: '2026-06-20' }),
      // Coffee: single txn -> not a pattern, filtered out
      tx({ category: COFFEE, amount_minor: 3000, transaction_date: '2026-07-02' }),
      // Income is ignored
      tx({ category: FOOD, type: 'income', amount_minor: 999999, transaction_date: '2026-07-03' }),
      // Out of window
      tx({ category: FOOD, amount_minor: 99900, transaction_date: '2026-01-01' }),
      // Uncategorised expense ignored
      tx({ category: null, amount_minor: 40000, transaction_date: '2026-07-04' }),
    ]

    const result = suggestBudgets(txns, { now: NOW, months: 3 })

    expect(result.map((s) => s.categoryId)).toEqual(['rent', 'food'])
    expect(result[0]).toMatchObject({
      categoryId: 'rent',
      categoryName: 'Housing',
      categoryIcon: '🏠',
      monthlyAverageMinor: 150000,
      suggestedAmountMinor: 150000,
      transactionCount: 3,
    })
    expect(result[1]).toMatchObject({
      categoryId: 'food',
      monthlyAverageMinor: 21000,
      suggestedAmountMinor: 21000,
      transactionCount: 3,
    })
  })

  it('skips categories that already have a budget', () => {
    const txns = [
      tx({ category: FOOD, amount_minor: 20000, transaction_date: '2026-05-01' }),
      tx({ category: FOOD, amount_minor: 20000, transaction_date: '2026-06-01' }),
      tx({ category: TRANSPORT, amount_minor: 10000, transaction_date: '2026-05-05' }),
      tx({ category: TRANSPORT, amount_minor: 14000, transaction_date: '2026-07-05' }),
    ]

    const result = suggestBudgets(txns, { now: NOW, months: 3, existingCategoryIds: ['food'] })
    expect(result.map((s) => s.categoryId)).toEqual(['transport'])
  })

  it('rounds the suggestion up to the nearest step above the average', () => {
    const txns = [
      // total K703.50 over 3 -> avg 23450 minor -> round up to 24000
      tx({ category: FOOD, amount_minor: 23450, transaction_date: '2026-05-01' }),
      tx({ category: FOOD, amount_minor: 23450, transaction_date: '2026-06-01' }),
      tx({ category: FOOD, amount_minor: 23450, transaction_date: '2026-07-01' }),
    ]
    const result = suggestBudgets(txns, { now: NOW, months: 3 })
    expect(result[0].monthlyAverageMinor).toBe(23450)
    expect(result[0].suggestedAmountMinor).toBe(24000)
  })

  it('returns nothing when there is no qualifying spend', () => {
    expect(suggestBudgets([], { now: NOW })).toEqual([])
    expect(
      suggestBudgets([tx({ category: COFFEE, amount_minor: 500, transaction_date: '2026-07-01' })], {
        now: NOW,
      }),
    ).toEqual([])
  })
})
