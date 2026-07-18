import { describe, expect, it } from 'vitest'
import { netBalances, openPairDebts, sharesSumValid, type SplitWithMeta } from './balances'

const split = (overrides: Partial<SplitWithMeta> & { shares: SplitWithMeta['shares'] }): SplitWithMeta => ({
  id: 's1',
  wallet_id: 'w1',
  transaction_id: 't1',
  created_by: 'alice',
  payer_user_id: 'alice',
  amount_minor: 3000,
  merchant: 'Lunch',
  transaction_date: '2026-07-01',
  ...overrides,
})

describe('netBalances', () => {
  it('nets unsettled shares toward the payer', () => {
    const splits = [
      split({
        shares: [
          { id: '1', split_id: 's1', member_user_id: 'alice', share_minor: 1000, settled: true },
          { id: '2', split_id: 's1', member_user_id: 'bob', share_minor: 1000, settled: false },
          { id: '3', split_id: 's1', member_user_id: 'cara', share_minor: 1000, settled: false },
        ],
      }),
    ]
    const nets = netBalances(splits)
    expect(nets.find((n) => n.userId === 'alice')?.netMinor).toBe(2000)
    expect(nets.find((n) => n.userId === 'bob')?.netMinor).toBe(-1000)
    expect(nets.find((n) => n.userId === 'cara')?.netMinor).toBe(-1000)
  })
})

describe('openPairDebts', () => {
  it('groups by debtor→payer', () => {
    const pairs = openPairDebts([
      split({
        shares: [
          { id: '1', split_id: 's1', member_user_id: 'alice', share_minor: 1500, settled: true },
          { id: '2', split_id: 's1', member_user_id: 'bob', share_minor: 1500, settled: false },
        ],
      }),
    ])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({
      fromUserId: 'bob',
      toUserId: 'alice',
      amountMinor: 1500,
    })
  })
})

describe('sharesSumValid', () => {
  it('requires exact sum', () => {
    expect(sharesSumValid([1000, 1000, 1000], 3000)).toBe(true)
    expect(sharesSumValid([1000, 1000], 3000)).toBe(false)
  })
})
