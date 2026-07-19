import { describe, expect, it } from 'vitest'
import {
  MAX_PENDING_AI_CONFIRMS,
  MAX_PENDING_CHAT,
  assertUnderCap,
  confirmIdsToReplace,
  shouldDropFailedAiConfirm,
  sortByQueuedAt,
  totalPendingCount,
} from './offlineQueueLogic'

describe('assertUnderCap', () => {
  it('allows counts below max and throws at/above', () => {
    expect(() => assertUnderCap(MAX_PENDING_CHAT - 1, MAX_PENDING_CHAT, 'chat messages')).not.toThrow()
    expect(() => assertUnderCap(MAX_PENDING_CHAT, MAX_PENDING_CHAT, 'chat messages')).toThrow(
      /Too many queued chat messages/,
    )
    expect(() => assertUnderCap(MAX_PENDING_AI_CONFIRMS, MAX_PENDING_AI_CONFIRMS, 'AI confirms')).toThrow(
      /AI confirms/,
    )
  })
})

describe('confirmIdsToReplace', () => {
  it('returns prior queue ids for the same action only', () => {
    expect(
      confirmIdsToReplace(
        [
          { id: '1', action_id: 'a' },
          { id: '2', action_id: 'b' },
          { id: '3', action_id: 'a' },
        ],
        'a',
      ),
    ).toEqual(['1', '3'])
    expect(confirmIdsToReplace([{ id: '1', action_id: 'a' }], 'z')).toEqual([])
  })
})

describe('sortByQueuedAt', () => {
  it('orders oldest first so flush is FIFO', () => {
    const sorted = sortByQueuedAt([
      { id: 'c', queued_at: '2026-07-14T12:00:00Z' },
      { id: 'a', queued_at: '2026-07-14T10:00:00Z' },
      { id: 'b', queued_at: '2026-07-14T11:00:00Z' },
    ])
    expect(sorted.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('does not mutate the input array', () => {
    const input = [
      { id: 'b', queued_at: '2026-07-14T11:00:00Z' },
      { id: 'a', queued_at: '2026-07-14T10:00:00Z' },
    ]
    sortByQueuedAt(input)
    expect(input[0]?.id).toBe('b')
  })
})

describe('totalPendingCount', () => {
  it('sums all three queues (regression: header used to count txs only)', () => {
    expect(totalPendingCount(2, 3, 4)).toBe(9)
    expect(totalPendingCount(0, 0, 0)).toBe(0)
  })
})

describe('shouldDropFailedAiConfirm', () => {
  it('drops already-resolved / missing actions', () => {
    expect(shouldDropFailedAiConfirm('That action was already resolved, please refresh.')).toBe(true)
    expect(shouldDropFailedAiConfirm('That action no longer exists.')).toBe(true)
    expect(shouldDropFailedAiConfirm(new Error('already resolved'))).toBe(true)
    expect(shouldDropFailedAiConfirm(new Error('404 Not Found'))).toBe(true)
    expect(shouldDropFailedAiConfirm(new Error('409 Conflict'))).toBe(true)
  })

  it('keeps retryable apply failures queued', () => {
    expect(shouldDropFailedAiConfirm('Edge Function returned a non-2xx status code')).toBe(false)
    expect(shouldDropFailedAiConfirm("Couldn't apply that change, please try again.")).toBe(false)
  })
})
