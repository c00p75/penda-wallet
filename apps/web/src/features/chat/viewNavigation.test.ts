import { describe, expect, it } from 'vitest'
import {
  isInChatViewKind,
  parseViewHref,
  pendaOpenIdFromLocation,
  pendaOpenStateFromHref,
} from './viewNavigation'

describe('parseViewHref', () => {
  it('parses transaction, budget, debt, and goal deep links', () => {
    expect(parseViewHref('/transactions?tx=t1')).toEqual({
      kind: 'transaction',
      id: 't1',
    })
    expect(parseViewHref('/budgets?budget=b1')).toEqual({ kind: 'budget', id: 'b1' })
    expect(parseViewHref('/goals?debt=d1')).toEqual({ kind: 'debt', id: 'd1' })
    expect(parseViewHref('/goals/g1')).toEqual({ kind: 'goal', id: 'g1' })
  })

  it('ignores list-only hrefs', () => {
    expect(parseViewHref('/transactions')).toEqual({})
    expect(parseViewHref('/goals?tab=debts')).toEqual({})
    expect(parseViewHref('/journal')).toEqual({})
  })
})

describe('pendaOpenStateFromHref', () => {
  it('builds location state for entity deep links', () => {
    expect(pendaOpenStateFromHref('/transactions?tx=t1')).toEqual({
      pendaOpen: { kind: 'transaction', id: 't1' },
    })
    expect(pendaOpenStateFromHref('/journal')).toBeUndefined()
  })
})

describe('pendaOpenIdFromLocation', () => {
  it('reads a matching kind from location state', () => {
    expect(
      pendaOpenIdFromLocation({ pendaOpen: { kind: 'budget', id: 'b9' } }, 'budget'),
    ).toBe('b9')
    expect(
      pendaOpenIdFromLocation({ pendaOpen: { kind: 'budget', id: 'b9' } }, 'debt'),
    ).toBeNull()
  })
})

describe('isInChatViewKind', () => {
  it('marks entity detail kinds for in-chat View', () => {
    expect(isInChatViewKind('transaction')).toBe(true)
    expect(isInChatViewKind('budget')).toBe(true)
    expect(isInChatViewKind('debt')).toBe(true)
    expect(isInChatViewKind('goal')).toBe(true)
    expect(isInChatViewKind(undefined)).toBe(false)
  })
})
