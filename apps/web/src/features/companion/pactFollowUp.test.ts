import { describe, expect, it } from 'vitest'
import {
  detectPactFollowUps,
  impulseDueForFollowUp,
  parsePactFollowUpReply,
} from './pactFollowUp'
import type { CommitmentPact } from '@/features/pacts/types'
import type { Transaction } from '@/features/transactions/types'

function pact(over: Partial<CommitmentPact> & Pick<CommitmentPact, 'start_date' | 'end_date'>): CommitmentPact {
  return {
    id: 'p1',
    wallet_id: 'w1',
    created_by: 'u1',
    description: 'No takeout',
    category_id: 'food',
    goal_id: null,
    created_at: '',
    ...over,
  }
}

describe('detectPactFollowUps', () => {
  it('flags midpoint check-ins', () => {
    // Jul 10 → Jul 20 mid is Jul 15
    const followUps = detectPactFollowUps({
      pacts: [pact({ start_date: '2026-07-10', end_date: '2026-07-20' })],
      transactions: [],
      now: new Date('2026-07-15T12:00:00Z'),
    })
    expect(followUps).toHaveLength(1)
    expect(followUps[0]!.kind).toBe('midpoint')
    expect(followUps[0]!.message).toContain('Halfway')
  })

  it('flags a broken pact', () => {
    const tx = {
      id: 't1',
      type: 'expense',
      category_id: 'food',
      transaction_date: '2026-07-12',
    } as Transaction
    const followUps = detectPactFollowUps({
      pacts: [pact({ start_date: '2026-07-10', end_date: '2026-07-20' })],
      transactions: [tx],
      now: new Date('2026-07-12T12:00:00Z'),
    })
    expect(followUps[0]!.kind).toBe('broken')
  })
})

describe('parsePactFollowUpReply', () => {
  it('parses kept / slipped / later', () => {
    expect(parsePactFollowUpReply('Kept it')).toBe('kept')
    expect(parsePactFollowUpReply('slipped')).toBe('slipped')
    expect(parsePactFollowUpReply('not now')).toBe('later')
    expect(parsePactFollowUpReply('maybe tomorrow')).toBeNull()
  })
})

describe('impulseDueForFollowUp', () => {
  it('returns due pauses', () => {
    const due = impulseDueForFollowUp(
      [{ id: 'i1', until: 100, merchant: 'Takealot', amountMinor: 200000 }],
      200,
    )
    expect(due).toHaveLength(1)
    expect(due[0]!.message).toContain('Takealot')
  })
})
