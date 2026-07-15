import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/features/transactions/types'
import type { RecurringTransaction } from '@/features/recurring/types'
import { splitActualSpend, upcomingFixedCosts } from './fixedCosts'

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 't',
    wallet_id: 'w1',
    created_by: 'u1',
    category_id: null,
    amount_minor: 0,
    currency: 'ZMW',
    type: 'expense',
    merchant: null,
    description: null,
    transaction_date: '2026-07-10',
    source: 'manual',
    receipt_storage_path: null,
    user_confirmed: true,
    version: 1,
    deleted_at: null,
    created_at: '',
    updated_at: '',
    category: null,
    ...overrides,
  }
}

function rule(overrides: Partial<RecurringTransaction>): RecurringTransaction {
  return {
    id: 'r',
    wallet_id: 'w1',
    created_by: 'u1',
    template: { category_id: null, amount_minor: 0, currency: 'ZMW', type: 'expense', merchant: null, description: null },
    frequency: 'monthly',
    next_run_date: '2026-07-01',
    last_run_date: null,
    is_active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('splitActualSpend', () => {
  it('counts recurring-sourced expenses as fixed and the rest as flexible', () => {
    const split = splitActualSpend(
      [
        tx({ amount_minor: 400_000, source: 'recurring' }), // rent
        tx({ amount_minor: 15_000, source: 'sms' }), // groceries via MoMo SMS
        tx({ amount_minor: 5_000, source: 'chat' }), // coffee logged in chat
        tx({ amount_minor: 999, type: 'income', source: 'manual' }), // ignored: income
        tx({ amount_minor: 100_000, source: 'recurring', transaction_date: '2026-06-28' }), // ignored: last month
      ],
      '2026-07-01',
    )
    expect(split.fixedMinor).toBe(400_000)
    expect(split.flexibleMinor).toBe(20_000)
    expect(split.totalMinor).toBe(420_000)
  })
})

describe('upcomingFixedCosts', () => {
  it('expands active expense rules due within the window and sums them', () => {
    const fixed = upcomingFixedCosts(
      [
        rule({ template: { category_id: null, amount_minor: 400_000, currency: 'ZMW', type: 'expense', merchant: 'Rent', description: null }, frequency: 'monthly', next_run_date: '2026-07-25' }),
        rule({ id: 'r2', template: { category_id: null, amount_minor: 5_000, currency: 'ZMW', type: 'expense', merchant: 'Netflix', description: null }, frequency: 'weekly', next_run_date: '2026-07-16' }),
      ],
      '2026-07-15',
      '2026-07-31',
    )
    // Rent once (25th) + Netflix on 16, 23, 30 = 3 × 5k.
    expect(fixed.totalMinor).toBe(400_000 + 15_000)
    expect(fixed.items).toHaveLength(4)
  })

  it('ignores income rules, inactive rules, and bills due outside the window', () => {
    const fixed = upcomingFixedCosts(
      [
        rule({ template: { category_id: null, amount_minor: 900_000, currency: 'ZMW', type: 'income', merchant: 'Salary', description: null }, next_run_date: '2026-07-25' }),
        rule({ id: 'r2', is_active: false, template: { category_id: null, amount_minor: 400_000, currency: 'ZMW', type: 'expense', merchant: 'Rent', description: null }, next_run_date: '2026-07-25' }),
        rule({ id: 'r3', template: { category_id: null, amount_minor: 400_000, currency: 'ZMW', type: 'expense', merchant: 'Rent', description: null }, next_run_date: '2026-08-25' }),
      ],
      '2026-07-15',
      '2026-07-31',
    )
    expect(fixed.totalMinor).toBe(0)
    expect(fixed.items).toHaveLength(0)
  })
})
