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
    // Equal thirds — largest is ~33% of the month, below the 35% bar.
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
})
