import { describe, expect, it } from 'vitest'
import type { BalanceReconciliation } from './types'
import { shouldPromptReconciliation } from './reconcile'

const NOW = new Date('2026-07-15T18:00:00Z')

function reconciliation(createdAt: string): BalanceReconciliation {
  return {
    id: 'r1',
    wallet_id: 'w1',
    user_id: 'u1',
    computed_balance_minor: 100000,
    actual_balance_minor: 100000,
    status: 'confirmed',
    created_at: createdAt,
  }
}

describe('shouldPromptReconciliation', () => {
  it('prompts when there is no reconciliation on record', () => {
    expect(shouldPromptReconciliation(null, NOW)).toBe(true)
  })

  it('does not prompt again after today\'s reconciliation', () => {
    expect(shouldPromptReconciliation(reconciliation('2026-07-15T08:00:00Z'), NOW)).toBe(false)
  })

  it('prompts again once a day has passed since the last one', () => {
    expect(shouldPromptReconciliation(reconciliation('2026-07-14T23:59:00Z'), NOW)).toBe(true)
  })
})
