import { describe, expect, it } from 'vitest'
import { detectMerchantSignals } from './subscriptionBrain'
import type { Transaction } from '@/features/transactions/types'

function tx(partial: {
  id: string
  merchant: string
  amount_minor: number
  transaction_date: string
}): Transaction {
  return {
    id: partial.id,
    wallet_id: 'w1',
    created_by: 'u1',
    category_id: null,
    amount_minor: partial.amount_minor,
    currency: 'USD',
    fx_rate_to_wallet_base: null,
    converted_amount_minor: null,
    type: 'expense',
    merchant: partial.merchant,
    description: null,
    transaction_date: partial.transaction_date,
    source: 'manual',
    receipt_storage_path: null,
    ai_extraction: null,
    user_confirmed: true,
    version: 1,
    deleted_at: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    category: null,
  }
}

describe('detectMerchantSignals', () => {
  const now = new Date('2026-07-18T12:00:00')

  it('flags subscription-like merchants', () => {
    const signals = detectMerchantSignals(
      [
        tx({ id: '1', merchant: 'Netflix', amount_minor: 9_900, transaction_date: '2026-05-18' }),
        tx({ id: '2', merchant: 'Netflix', amount_minor: 9_900, transaction_date: '2026-06-18' }),
        tx({ id: '3', merchant: 'Netflix', amount_minor: 9_900, transaction_date: '2026-07-18' }),
      ],
      { now },
    )
    expect(signals.some((s) => s.kind === 'possible_sub' || s.kind === 'quiet_sub')).toBe(true)
  })

  it('detects price jumps', () => {
    const signals = detectMerchantSignals(
      [
        tx({ id: '1', merchant: 'Gym', amount_minor: 10_000, transaction_date: '2026-04-01' }),
        tx({ id: '2', merchant: 'Gym', amount_minor: 10_000, transaction_date: '2026-05-01' }),
        tx({ id: '3', merchant: 'Gym', amount_minor: 10_000, transaction_date: '2026-06-01' }),
        tx({ id: '4', merchant: 'Gym', amount_minor: 13_000, transaction_date: '2026-07-01' }),
      ],
      { now },
    )
    expect(signals.some((s) => s.kind === 'price_change')).toBe(true)
  })
})
