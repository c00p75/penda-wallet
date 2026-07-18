import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/features/transactions/types'
import { computeRetro, previousMonthStart } from './retro'

function tx(overrides: Partial<Transaction> & { amount_minor: number; transaction_date: string }): Transaction {
  return {
    id: 't',
    wallet_id: 'w1',
    created_by: 'u1',
    category_id: null,
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
  }
}

describe('computeRetro', () => {
  it('reports under-plan when spend landed comfortably below the intention', () => {
    const retro = computeRetro(1_000_000, '2026-06-01', [
      tx({ amount_minor: 400_000, transaction_date: '2026-06-10' }),
      tx({ amount_minor: 200_000, transaction_date: '2026-06-20' }),
      tx({ amount_minor: 999_999, type: 'income', transaction_date: '2026-06-15' }),
      tx({ amount_minor: 500_000, transaction_date: '2026-07-05' }), // next month, excluded
    ])
    expect(retro.spentMinor).toBe(600_000)
    expect(retro.deltaMinor).toBe(400_000)
    expect(retro.pace).toBe('under')
  })

  it('reports over-plan when spend exceeded the intention', () => {
    const retro = computeRetro(500_000, '2026-06-01', [
      tx({ amount_minor: 600_000, transaction_date: '2026-06-15' }),
    ])
    expect(retro.pace).toBe('over')
    expect(retro.deltaMinor).toBe(-100_000)
  })

  it('reports on-target within a small tolerance of the intention', () => {
    const retro = computeRetro(500_000, '2026-06-01', [
      tx({ amount_minor: 490_000, transaction_date: '2026-06-15' }),
    ])
    expect(retro.pace).toBe('on-target')
  })
})

describe('previousMonthStart', () => {
  it('steps back one calendar month', () => {
    expect(previousMonthStart('2026-07-01')).toBe('2026-06-01')
  })

  it('rolls back across a year boundary', () => {
    expect(previousMonthStart('2026-01-01')).toBe('2025-12-01')
  })
})
