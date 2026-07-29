import { describe, expect, it } from 'vitest'
import { findTransferSibling } from './transferSibling'

const leg = (id: string, groupId: string | null, accountId: string) => ({
  id,
  transfer_group_id: groupId,
  account_id: accountId,
})

describe('findTransferSibling', () => {
  it('finds the other leg sharing the same transfer_group_id', () => {
    const legs = [leg('a', 'g1', 'cash'), leg('b', 'g1', 'bank'), leg('c', 'g2', 'momo')]
    expect(findTransferSibling(legs, legs[0])?.id).toBe('b')
    expect(findTransferSibling(legs, legs[1])?.id).toBe('a')
  })

  it('returns null when there is no group id or no match', () => {
    const legs = [leg('a', null, 'cash'), leg('b', 'g1', 'bank')]
    expect(findTransferSibling(legs, legs[0])).toBeNull()
    expect(findTransferSibling(legs, legs[1])).toBeNull()
  })
})
