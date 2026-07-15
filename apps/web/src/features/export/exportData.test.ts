import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/features/transactions/types'
import type { Category } from '@/features/categories/types'
import { buildExportJSON, buildTransactionsCSV } from './exportData'

const FOOD: Category = { id: 'food', wallet_id: null, name: 'Food & Drinks', icon: '🍔', color: null, parent_category_id: null, is_system: true }

function tx(overrides: Partial<Transaction> & { amount_minor: number; transaction_date: string }): Transaction {
  return {
    id: 't1',
    wallet_id: 'w1',
    created_by: 'u1',
    category_id: 'food',
    currency: 'ZMW',
    type: 'expense',
    merchant: 'Blue Bottle, Cafe',
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
  }
}

describe('buildTransactionsCSV', () => {
  it('renders a header row plus one row per transaction with resolved category names', () => {
    const csv = buildTransactionsCSV({
      transactions: [tx({ amount_minor: 12050, transaction_date: '2026-07-15' })],
      categories: [FOOD],
    })
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('date,type,amount,currency,category,merchant,description,source')
    expect(lines[1]).toContain('2026-07-15,expense,120.5,ZMW,Food & Drinks')
  })

  it('quotes fields containing commas', () => {
    const csv = buildTransactionsCSV({
      transactions: [tx({ amount_minor: 1000, transaction_date: '2026-07-15', merchant: 'Blue Bottle, Cafe' })],
      categories: [FOOD],
    })
    expect(csv).toContain('"Blue Bottle, Cafe"')
  })
})

describe('buildExportJSON', () => {
  it('produces a structured export with human-readable amounts and category names', () => {
    const json = JSON.parse(
      buildExportJSON({
        transactions: [tx({ amount_minor: 5000, transaction_date: '2026-07-15' })],
        budgets: [],
        goals: [],
        debts: [],
        categories: [FOOD],
      }),
    )
    expect(json.transactions).toHaveLength(1)
    expect(json.transactions[0]).toMatchObject({ amount: 50, category: 'Food & Drinks' })
    expect(json.exported_at).toBeDefined()
  })
})
