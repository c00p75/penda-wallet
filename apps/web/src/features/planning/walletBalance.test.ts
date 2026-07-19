import { describe, expect, it } from 'vitest'
import { remainingFromCashInMinor, walletBalanceMinor } from './walletBalance'
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

describe('walletBalanceMinor', () => {
  it('sums income minus expense', () => {
    expect(
      walletBalanceMinor([
        tx({ amount_minor: 50_000, type: 'income', transaction_date: '2026-07-01' }),
        tx({ amount_minor: 63_200, type: 'expense', transaction_date: '2026-07-10' }),
      ]),
    ).toBe(-13_200)
  })
})

describe('remainingFromCashInMinor', () => {
  it('subtracts spend after the cash-in', () => {
    const now = new Date(2026, 6, 18)
    expect(
      remainingFromCashInMinor(
        [
          tx({ id: 'in', amount_minor: 50_000, type: 'income', transaction_date: '2026-07-10' }),
          tx({ id: 'out', amount_minor: 63_200, type: 'expense', transaction_date: '2026-07-15' }),
        ],
        tx({ amount_minor: 50_000, type: 'income', transaction_date: '2026-07-10' }),
        { now },
      ),
    ).toBe(-13_200)
  })
})
