import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/features/transactions/types'
import { detectGhostLeaks } from './detectGhostLeaks'

const NOW = new Date('2026-07-15T10:00:00Z')

let seq = 0
function tx(over: Partial<Transaction> & { amount_minor: number; transaction_date: string }): Transaction {
  seq += 1
  return {
    id: `tx-${seq}`,
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
    created_at: over.transaction_date,
    updated_at: over.transaction_date,
    category: null,
    fx_rate_to_wallet_base: null,
    converted_amount_minor: null,
    ...over,
  } as Transaction
}

describe('detectGhostLeaks', () => {
  it('flags repeated fee-like charges', () => {
    const insights = detectGhostLeaks({
      transactions: [
        tx({ amount_minor: 150, merchant: 'MTN Transfer Fee', transaction_date: '2026-07-01' }),
        tx({ amount_minor: 150, description: 'Service fee', transaction_date: '2026-07-08' }),
        tx({ amount_minor: 200, merchant: 'Bank charge', transaction_date: '2026-07-10' }),
      ],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights.some((i) => i.id === 'ghost:fees')).toBe(true)
  })

  it('flags small repeated P2P amounts to the same merchant', () => {
    const insights = detectGhostLeaks({
      transactions: [
        tx({ amount_minor: 500, merchant: 'Chanda', transaction_date: '2026-07-02' }),
        tx({ amount_minor: 500, merchant: 'Chanda', transaction_date: '2026-07-05' }),
        tx({ amount_minor: 1000, merchant: 'Chanda', transaction_date: '2026-07-09' }),
      ],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights.some((i) => i.id.startsWith('ghost:p2p:'))).toBe(true)
  })

  it('needs at least two fee hits', () => {
    const insights = detectGhostLeaks({
      transactions: [tx({ amount_minor: 150, merchant: 'Transfer Fee', transaction_date: '2026-07-01' })],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights.some((i) => i.id === 'ghost:fees')).toBe(false)
  })

  it('ignores fee-like income', () => {
    const insights = detectGhostLeaks({
      transactions: [
        tx({ amount_minor: 150, type: 'income', merchant: 'Fee rebate', transaction_date: '2026-07-01' }),
        tx({ amount_minor: 150, type: 'income', description: 'Service fee refund', transaction_date: '2026-07-08' }),
      ],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights).toHaveLength(0)
  })

  it('ignores transactions older than 30 days', () => {
    const insights = detectGhostLeaks({
      transactions: [
        tx({ amount_minor: 150, merchant: 'Transfer Fee', transaction_date: '2026-06-01' }),
        tx({ amount_minor: 150, merchant: 'Transfer Fee', transaction_date: '2026-06-02' }),
        tx({ amount_minor: 500, merchant: 'Chanda', transaction_date: '2026-06-01' }),
        tx({ amount_minor: 500, merchant: 'Chanda', transaction_date: '2026-06-02' }),
        tx({ amount_minor: 500, merchant: 'Chanda', transaction_date: '2026-06-03' }),
      ],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights).toHaveLength(0)
  })

  it('does not flag P2P until the 3rd small send', () => {
    const two = detectGhostLeaks({
      transactions: [
        tx({ amount_minor: 500, merchant: 'Chanda', transaction_date: '2026-07-02' }),
        tx({ amount_minor: 500, merchant: 'Chanda', transaction_date: '2026-07-05' }),
      ],
      currency: 'ZMW',
      now: NOW,
    })
    expect(two.some((i) => i.id.startsWith('ghost:p2p:'))).toBe(false)
  })

  it('ignores large transfers even if repeated', () => {
    const insights = detectGhostLeaks({
      transactions: [
        tx({ amount_minor: 5000, merchant: 'Chanda', transaction_date: '2026-07-02' }),
        tx({ amount_minor: 5000, merchant: 'Chanda', transaction_date: '2026-07-05' }),
        tx({ amount_minor: 5000, merchant: 'Chanda', transaction_date: '2026-07-09' }),
      ],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights.some((i) => i.id.startsWith('ghost:p2p:'))).toBe(false)
  })

  it('matches merchants case-insensitively', () => {
    const insights = detectGhostLeaks({
      transactions: [
        tx({ amount_minor: 500, merchant: 'CHANDA', transaction_date: '2026-07-02' }),
        tx({ amount_minor: 500, merchant: 'chanda', transaction_date: '2026-07-05' }),
        tx({ amount_minor: 500, merchant: 'Chanda', transaction_date: '2026-07-09' }),
      ],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights.some((i) => i.id === 'ghost:p2p:chanda')).toBe(true)
  })

  it('falls back to description when merchant is missing', () => {
    const insights = detectGhostLeaks({
      transactions: [
        tx({ amount_minor: 400, description: 'Agent tip', transaction_date: '2026-07-02' }),
        tx({ amount_minor: 400, description: 'Agent tip', transaction_date: '2026-07-05' }),
        tx({ amount_minor: 400, description: 'Agent tip', transaction_date: '2026-07-09' }),
      ],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights.some((i) => i.id === 'ghost:p2p:agent tip')).toBe(true)
  })

  it('skips blank merchant/description for P2P clustering', () => {
    const insights = detectGhostLeaks({
      transactions: [
        tx({ amount_minor: 400, transaction_date: '2026-07-02' }),
        tx({ amount_minor: 400, transaction_date: '2026-07-05' }),
        tx({ amount_minor: 400, transaction_date: '2026-07-09' }),
      ],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights.some((i) => i.id.startsWith('ghost:p2p:'))).toBe(false)
  })

  it('picks the merchant with the highest repeat count', () => {
    const insights = detectGhostLeaks({
      transactions: [
        tx({ amount_minor: 500, merchant: 'A', transaction_date: '2026-07-01' }),
        tx({ amount_minor: 500, merchant: 'A', transaction_date: '2026-07-02' }),
        tx({ amount_minor: 500, merchant: 'A', transaction_date: '2026-07-03' }),
        tx({ amount_minor: 500, merchant: 'B', transaction_date: '2026-07-01' }),
        tx({ amount_minor: 500, merchant: 'B', transaction_date: '2026-07-02' }),
        tx({ amount_minor: 500, merchant: 'B', transaction_date: '2026-07-03' }),
        tx({ amount_minor: 500, merchant: 'B', transaction_date: '2026-07-04' }),
      ],
      currency: 'ZMW',
      now: NOW,
    })
    const p2p = insights.find((i) => i.id.startsWith('ghost:p2p:'))
    expect(p2p?.id).toBe('ghost:p2p:b')
  })

  it('uses converted_amount_minor when present for fee totals', () => {
    const insights = detectGhostLeaks({
      transactions: [
        tx({
          amount_minor: 100,
          converted_amount_minor: 1000,
          merchant: 'Transfer Fee',
          transaction_date: '2026-07-01',
        }),
        tx({
          amount_minor: 100,
          converted_amount_minor: 1000,
          description: 'Service fee',
          transaction_date: '2026-07-08',
        }),
      ],
      currency: 'ZMW',
      now: NOW,
    })
    const fees = insights.find((i) => i.id === 'ghost:fees')
    expect(fees?.amountMinor).toBe(2000)
  })

  it.each([
    ['Transfer Fee', true],
    ['bank charge', true],
    ['SERVICE FEE', true],
    ['fee for SMS', true],
    ['Shoprite', false],
    ['Coffee', false],
  ] as const)('fee pattern: %s → match=%s', (merchant, shouldMatch) => {
    const insights = detectGhostLeaks({
      transactions: [
        tx({ amount_minor: 100, merchant, transaction_date: '2026-07-01' }),
        tx({ amount_minor: 100, merchant, transaction_date: '2026-07-08' }),
      ],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights.some((i) => i.id === 'ghost:fees')).toBe(shouldMatch)
  })
})
