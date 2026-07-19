import { describe, expect, it } from 'vitest'
import { suggestBufferFromIncome } from './bufferSuggest'
import type { Transaction } from '@/features/transactions/types'

function tx(over: Partial<Transaction> & Pick<Transaction, 'amount_minor' | 'type' | 'transaction_date'>): Transaction {
  return {
    id: 't1',
    wallet_id: 'w1',
    created_by: 'u1',
    category_id: null,
    currency: 'ZMW',
    merchant: null,
    description: null,
    source: 'manual',
    receipt_storage_path: null,
    ai_extraction: null,
    user_confirmed: true,
    version: 1,
    deleted_at: null,
    created_at: '',
    updated_at: '',
    category: null,
    ...over,
  }
}

describe('suggestBufferFromIncome', () => {
  it('suggests parking ~30% of a dominant cash-in', () => {
    const now = new Date(2026, 6, 18)
    const result = suggestBufferFromIncome(
      [
        tx({ amount_minor: 1_000_000, type: 'income', transaction_date: '2026-07-01' }),
        tx({ amount_minor: 50_000, type: 'income', transaction_date: '2026-07-10' }),
      ],
      { now },
    )
    expect(result?.suggestMinor).toBe(300_000)
  })

  it('returns null when no single cash-in dominates', () => {
    const now = new Date(2026, 6, 18)
    // Equal thirds, largest is ~33% of the month, below the 35% bar.
    expect(
      suggestBufferFromIncome(
        [
          tx({ id: 'a', amount_minor: 100_000, type: 'income', transaction_date: '2026-07-01' }),
          tx({ id: 'b', amount_minor: 100_000, type: 'income', transaction_date: '2026-07-08' }),
          tx({ id: 'c', amount_minor: 100_000, type: 'income', transaction_date: '2026-07-15' }),
        ],
        { now },
      ),
    ).toBeNull()
  })

  it('returns null when the cash-in has already been spent', () => {
    const now = new Date(2026, 6, 18)
    expect(
      suggestBufferFromIncome(
        [
          tx({ id: 'in', amount_minor: 50_000, type: 'income', transaction_date: '2026-07-10' }),
          tx({ id: 'out1', amount_minor: 40_000, type: 'expense', transaction_date: '2026-07-12' }),
          tx({ id: 'out2', amount_minor: 23_200, type: 'expense', transaction_date: '2026-07-15' }),
        ],
        { now },
      ),
    ).toBeNull()
  })

  it('returns null when wallet balance is negative', () => {
    const now = new Date(2026, 6, 18)
    expect(
      suggestBufferFromIncome(
        [tx({ amount_minor: 50_000, type: 'income', transaction_date: '2026-07-10' })],
        { now, availableBalanceMinor: -13_200 },
      ),
    ).toBeNull()
  })

  it('caps the suggestion to what remains of the cash-in', () => {
    const now = new Date(2026, 6, 18)
    // Ideal park is 30% of 500k = 150k, but only 80k left after spending.
    const result = suggestBufferFromIncome(
      [
        tx({ id: 'in', amount_minor: 500_000, type: 'income', transaction_date: '2026-07-01' }),
        tx({ id: 'out', amount_minor: 420_000, type: 'expense', transaction_date: '2026-07-05' }),
      ],
      { now, availableBalanceMinor: 80_000 },
    )
    expect(result?.suggestMinor).toBe(80_000)
  })

  it('ignores expenses that happened before the cash-in', () => {
    const now = new Date(2026, 6, 18)
    const result = suggestBufferFromIncome(
      [
        tx({ id: 'old', amount_minor: 200_000, type: 'expense', transaction_date: '2026-07-01' }),
        tx({ id: 'in', amount_minor: 500_000, type: 'income', transaction_date: '2026-07-10' }),
      ],
      { now, availableBalanceMinor: 300_000 },
    )
    expect(result?.suggestMinor).toBe(150_000)
  })
})
