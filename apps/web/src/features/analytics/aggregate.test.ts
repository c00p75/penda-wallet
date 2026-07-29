import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/features/transactions/types'
import { bucketCashflow, categoryTotals, filterByRange, sumByType } from './aggregate'

let seq = 0
function tx(overrides: Partial<Transaction>): Transaction {
  seq += 1
  return {
    id: `tx-${seq}`,
    wallet_id: 'wallet-1',
    account_id: null,
    transfer_group_id: null,
    created_by: 'user-1',
    category_id: null,
    amount_minor: 1000,
    currency: 'USD',
    fx_rate_to_wallet_base: null,
    converted_amount_minor: null,
    type: 'expense',
    merchant: null,
    description: null,
    transaction_date: '2026-07-15',
    source: 'manual',
    receipt_storage_path: null,
    ai_extraction: null,
    user_confirmed: true,
    version: 1,
    deleted_at: null,
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
    category: null,
    ...overrides,
  }
}

describe('filterByRange', () => {
  it('keeps transactions inside the inclusive window and drops the rest', () => {
    const transactions = [
      tx({ transaction_date: '2026-06-30' }),
      tx({ transaction_date: '2026-07-01' }),
      tx({ transaction_date: '2026-07-15' }),
      tx({ transaction_date: '2026-08-01' }),
    ]
    const filtered = filterByRange(transactions, { start: '2026-07-01', end: '2026-07-31' })
    expect(filtered.map((t) => t.transaction_date)).toEqual(['2026-07-01', '2026-07-15'])
  })
})

describe('sumByType', () => {
  it('prefers converted_amount_minor over amount_minor when present', () => {
    const transactions = [
      tx({ type: 'income', amount_minor: 5000, converted_amount_minor: 4500 }),
      tx({ type: 'income', amount_minor: 1000, converted_amount_minor: null }),
      tx({ type: 'expense', amount_minor: 9999 }),
    ]
    expect(sumByType(transactions, 'income')).toBe(5500)
    expect(sumByType(transactions, 'expense')).toBe(9999)
  })
})

describe('categoryTotals', () => {
  it('sorts descending and merges everything past topN into Other', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
    const transactions = names.map((name, i) =>
      tx({ type: 'expense', amount_minor: (names.length - i) * 100, category: { id: name, name } as never }),
    )
    const result = categoryTotals(transactions, 'expense', 7)
    expect(result).toHaveLength(8)
    expect(result[0]).toEqual({ category: 'A', amount_minor: 900 })
    expect(result.at(-1)).toEqual({ category: 'Other', amount_minor: 200 + 100 }) // H + I
  })

  it('returns everything as-is when under the cap, no Other bucket', () => {
    const transactions = [
      tx({ type: 'expense', amount_minor: 500, category: { id: 'x', name: 'Groceries' } as never }),
    ]
    expect(categoryTotals(transactions, 'expense')).toEqual([{ category: 'Groceries', amount_minor: 500 }])
  })

  it('only counts the requested transaction type', () => {
    const transactions = [
      tx({ type: 'income', amount_minor: 5000, category: { id: 's', name: 'Salary' } as never }),
      tx({ type: 'expense', amount_minor: 500, category: { id: 'g', name: 'Groceries' } as never }),
    ]
    expect(categoryTotals(transactions, 'income')).toEqual([{ category: 'Salary', amount_minor: 5000 }])
  })
})

describe('bucketCashflow', () => {
  it('produces one bucket per calendar month across the range, including empty months', () => {
    const transactions = [
      tx({ type: 'income', transaction_date: '2026-05-10', amount_minor: 2000 }),
      tx({ type: 'expense', transaction_date: '2026-07-03', amount_minor: 500 }),
    ]
    const buckets = bucketCashflow(transactions, { start: '2026-05-01', end: '2026-07-31' }, 'month')
    expect(buckets.map((b) => b.key)).toEqual(['2026-05', '2026-06', '2026-07'])
    expect(buckets[0]).toMatchObject({ incomeMinor: 2000, expenseMinor: 0 })
    expect(buckets[1]).toMatchObject({ incomeMinor: 0, expenseMinor: 0 })
    expect(buckets[2]).toMatchObject({ incomeMinor: 0, expenseMinor: 500 })
  })

  it('buckets daily when granularity is day', () => {
    const transactions = [tx({ type: 'expense', transaction_date: '2026-07-02', amount_minor: 300 })]
    const buckets = bucketCashflow(transactions, { start: '2026-07-01', end: '2026-07-03' }, 'day')
    expect(buckets.map((b) => b.key)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
    expect(buckets[1].expenseMinor).toBe(300)
  })

  it('ignores transfers', () => {
    const transactions = [tx({ type: 'transfer', transaction_date: '2026-07-02', amount_minor: 300 })]
    const buckets = bucketCashflow(transactions, { start: '2026-07-01', end: '2026-07-03' }, 'day')
    expect(buckets.every((b) => b.incomeMinor === 0 && b.expenseMinor === 0)).toBe(true)
  })
})
