import { describe, expect, it } from 'vitest'
import { CHAT_PAGES, isValidPageContext, pageContextFromPathname } from './pageContext'

describe('pageContextFromPathname', () => {
  it.each([
    ['/', { page: 'home' }],
    ['/transactions', { page: 'ledger' }],
    ['/budgets', { page: 'budgets' }],
    ['/goals', { page: 'goals' }],
    ['/cashflow', { page: 'cashflow' }],
    ['/challenges', { page: 'challenges' }],
    ['/analytics', { page: 'analytics' }],
    ['/journal', { page: 'journal' }],
    ['/simulator', { page: 'simulator' }],
    ['/settings', { page: 'settings' }],
    ['/profile', { page: 'profile' }],
    ['/business', { page: 'business' }],
    ['/missions', { page: 'missions' }],
    ['/activity', { page: 'activity' }],
    ['/notifications', { page: 'notifications' }],
    ['/ai-actions', { page: 'ai-actions' }],
    ['/family', { page: 'family' }],
    ['/settle-up', { page: 'settle-up' }],
    ['/radar', { page: 'radar' }],
  ] as const)('%s → %j', (path, expected) => {
    expect(pageContextFromPathname(path)).toEqual(expected)
  })

  it('parses goal detail when the id is a uuid', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    expect(pageContextFromPathname(`/goals/${id}`)).toEqual({ page: 'goal-detail', entityId: id })
  })

  it('falls back to goals for non-uuid goal paths', () => {
    expect(pageContextFromPathname('/goals/not-a-uuid')).toEqual({ page: 'goals' })
  })

  it('returns undefined for unknown paths', () => {
    expect(pageContextFromPathname('/nope')).toBeUndefined()
    expect(pageContextFromPathname('/goals/extra/nested')).toBeUndefined()
  })
})

describe('isValidPageContext', () => {
  it('accepts allowlisted pages', () => {
    for (const page of CHAT_PAGES) {
      expect(isValidPageContext({ page })).toBe(true)
    }
  })

  it('rejects unknown pages and bad entity ids', () => {
    expect(isValidPageContext({ page: 'admin' })).toBe(false)
    expect(isValidPageContext({ page: 'home', entityId: 'nope' })).toBe(false)
    expect(isValidPageContext(null)).toBe(false)
    expect(isValidPageContext('home')).toBe(false)
  })

  it('accepts uuid entity ids', () => {
    expect(
      isValidPageContext({
        page: 'goal-detail',
        entityId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      }),
    ).toBe(true)
  })
})
