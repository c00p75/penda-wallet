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
    user_confirmed: true,
    version: 1,
    deleted_at: null,
    created_at: over.transaction_date,
    updated_at: over.transaction_date,
    category: null,
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
})
