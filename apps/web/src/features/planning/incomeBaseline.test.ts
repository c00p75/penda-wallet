import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/features/transactions/types'
import { computeIncomeBaseline } from './incomeBaseline'

const NOW = new Date('2026-07-15T00:00:00Z')

function tx(overrides: Partial<Transaction> & { amount_minor: number; transaction_date: string }): Transaction {
  return {
    id: 't',
    wallet_id: 'w1',
    created_by: 'u1',
    category_id: null,
    currency: 'ZMW',
    type: 'income',
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

describe('computeIncomeBaseline', () => {
  it('treats steady monthly income as regular and baselines on the average', () => {
    const baseline = computeIncomeBaseline(
      [
        tx({ amount_minor: 1_000_000, transaction_date: '2026-04-05' }),
        tx({ amount_minor: 1_020_000, transaction_date: '2026-05-05' }),
        tx({ amount_minor: 990_000, transaction_date: '2026-06-05' }),
        tx({ amount_minor: 5_000_000, transaction_date: '2026-07-05' }), // current month, excluded
      ],
      NOW,
      3,
    )
    expect(baseline).not.toBeNull()
    expect(baseline!.isIrregular).toBe(false)
    expect(baseline!.conservativeMinor).toBe(baseline!.averageMinor)
  })

  it('flags lumpy income as irregular and baselines on the lowest recent month', () => {
    const baseline = computeIncomeBaseline(
      [
        tx({ amount_minor: 300_000, transaction_date: '2026-05-05' }),
        tx({ amount_minor: 1_800_000, transaction_date: '2026-06-05' }),
        tx({ amount_minor: 250_000, transaction_date: '2026-06-20' }),
      ],
      NOW,
      3,
    )
    expect(baseline).not.toBeNull()
    expect(baseline!.isIrregular).toBe(true)
    expect(baseline!.conservativeMinor).toBe(baseline!.minMinor)
  })

  it('ignores expense transactions and the current, still-incomplete month', () => {
    const baseline = computeIncomeBaseline(
      [
        tx({ amount_minor: 1_000_000, transaction_date: '2026-05-05' }),
        tx({ amount_minor: 1_000_000, transaction_date: '2026-06-05' }),
        tx({ amount_minor: 999_999, type: 'expense', transaction_date: '2026-06-10' }),
        tx({ amount_minor: 50_000, transaction_date: '2026-07-14' }),
      ],
      NOW,
      3,
    )
    expect(baseline!.monthsConsidered).toBe(2)
    expect(baseline!.averageMinor).toBe(1_000_000)
  })

  it('returns null with fewer than two months of income history', () => {
    expect(computeIncomeBaseline([tx({ amount_minor: 1_000_000, transaction_date: '2026-06-05' })], NOW, 3)).toBeNull()
    expect(computeIncomeBaseline([], NOW, 3)).toBeNull()
  })
})
