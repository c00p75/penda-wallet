import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/features/transactions/types'
import type { CommitmentPact } from './types'
import { computePactStatus } from './pactStatus'

const NOW = new Date('2026-07-15T12:00:00Z')

function pact(overrides: Partial<CommitmentPact> = {}): Pick<CommitmentPact, 'start_date' | 'end_date' | 'category_id'> {
  return { start_date: '2026-07-14', end_date: '2026-07-21', category_id: 'food', ...overrides }
}

function tx(overrides: Partial<Transaction> & { transaction_date: string }): Transaction {
  return {
    id: 'tx1',
    wallet_id: 'w1',
    created_by: 'u1',
    category_id: null,
    amount_minor: 1000,
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

describe('computePactStatus', () => {
  it('stays active with days left when nothing in the category has landed', () => {
    const result = computePactStatus(pact(), [tx({ category_id: 'transport', transaction_date: '2026-07-15' })], NOW)
    expect(result.status).toBe('active')
    expect(result.daysLeft).toBe(6)
    expect(result.breakingTransaction).toBeNull()
  })

  it('breaks the moment a matching-category expense lands in the window', () => {
    const breaker = tx({ category_id: 'food', transaction_date: '2026-07-15' })
    const result = computePactStatus(pact(), [breaker], NOW)
    expect(result.status).toBe('broken')
    expect(result.breakingTransaction).toBe(breaker)
  })

  it('ignores income and out-of-window transactions in the same category', () => {
    const result = computePactStatus(pact(), [
      tx({ category_id: 'food', type: 'income', transaction_date: '2026-07-15' }),
      tx({ category_id: 'food', transaction_date: '2026-07-01' }), // before the window
      tx({ category_id: 'food', transaction_date: '2026-08-01' }), // after the window
    ], NOW)
    expect(result.status).toBe('active')
  })

  it('is kept once the window ends with nothing breaking it', () => {
    const result = computePactStatus(pact({ end_date: '2026-07-10' }), [], NOW)
    expect(result.status).toBe('kept')
    expect(result.daysLeft).toBe(0)
  })
})
