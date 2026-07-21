import { describe, expect, it } from 'vitest'
import {
  finalizeLiveActions,
  listHrefFor,
  listLabelFor,
  mergeTrailActions,
  pendingToTrailActions,
  viewHrefFor,
  withViewHrefs,
} from './actionMeta'
import type { ChatAction, PendingAction } from './types'

describe('viewHrefFor', () => {
  it.each([
    ['transaction', undefined, '/transactions'],
    ['transaction', 'tx1', '/transactions?tx=tx1'],
    ['budget', undefined, '/budgets'],
    ['budget', 'b1', '/budgets?budget=b1'],
    ['goal', 'g1', '/goals/g1'],
    ['goal', undefined, '/goals'],
    ['debt', undefined, '/goals?tab=debts'],
    ['debt', 'd1', '/goals?debt=d1'],
    ['memory', undefined, '/journal'],
    ['summary', undefined, '/analytics'],
    ['query', undefined, '/analytics'],
    ['wallet', undefined, undefined],
  ] as const)('%s / %s → %s', (domain, targetId, href) => {
    expect(viewHrefFor(domain, targetId)).toBe(href)
  })
})

describe('listHrefFor / listLabelFor', () => {
  it.each([
    ['transaction', '/transactions', 'View transactions'],
    ['budget', '/budgets', 'View budgets'],
    ['goal', '/goals', 'View goals'],
    ['debt', '/goals?tab=debts', 'View debts'],
    ['memory', '/journal', 'View journal'],
    ['summary', '/analytics', 'View analytics'],
    ['wallet', undefined, undefined],
  ] as const)('%s → list %s / %s', (domain, href, label) => {
    expect(listHrefFor(domain)).toBe(href)
    expect(listLabelFor(domain)).toBe(label)
  })
})

describe('pendingToTrailActions / mergeTrailActions', () => {
  const pending: PendingAction[] = [
    {
      id: 'p1',
      kind: 'update',
      domain: 'goal',
      summary: 'Rename goal',
      targetId: 'g1',
    },
    {
      id: 'p2',
      kind: 'delete',
      domain: 'transaction',
      summary: 'Delete lunch',
      targetId: 't1',
    },
  ]

  it('keeps unresolved rows pending and maps resolved status', () => {
    const rows = pendingToTrailActions(pending, { p1: 'confirmed' })
    expect(rows[0]).toMatchObject({
      id: 'p1',
      status: 'confirmed',
      viewHref: '/goals/g1',
      pendingKind: 'update',
    })
    expect(rows[1]).toMatchObject({ id: 'p2', status: 'pending', viewHref: undefined })
  })

  it('sends confirmed deletes to the list, not the deleted item', () => {
    const rows = pendingToTrailActions(pending, { p2: 'confirmed' })
    expect(rows[1]).toMatchObject({
      id: 'p2',
      status: 'confirmed',
      pendingKind: 'delete',
      viewHref: '/transactions',
    })
  })

  it('appends pending rows after completed tool steps', () => {
    const completed: ChatAction[] = [
      {
        id: 'c1',
        tool: 'create_transaction',
        domain: 'transaction',
        label: 'Logged',
        summary: 'Lunch',
        status: 'done',
        targetId: 'tx1',
      },
    ]
    const merged = mergeTrailActions(completed, pending, { p2: 'cancelled' })
    expect(merged.map((a) => a.id)).toEqual(['c1', 'p1', 'p2'])
    expect(merged[0]?.viewHref).toBe('/transactions?tx=tx1')
    expect(merged[2]?.status).toBe('cancelled')
  })

  it('handles empty inputs', () => {
    expect(mergeTrailActions(undefined, undefined, {})).toEqual([])
    expect(mergeTrailActions([], [], {})).toEqual([])
  })
})

describe('finalizeLiveActions', () => {
  it('drops staging tools and marks running as done', () => {
    const out = finalizeLiveActions([
      {
        id: '1',
        tool: 'create_goal',
        domain: 'goal',
        label: 'Goal',
        summary: 'Laptop',
        status: 'running',
        targetId: 'g1',
      },
      {
        id: '2',
        tool: 'update_record',
        domain: 'goal',
        label: 'Update',
        summary: 'x',
        status: 'running',
      },
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ status: 'done', viewHref: '/goals/g1' })
  })
})

describe('withViewHrefs', () => {
  it('skips error/running rows', () => {
    const actions: ChatAction[] = [
      {
        id: '1',
        tool: 'create_transaction',
        domain: 'transaction',
        label: 'x',
        summary: 'y',
        status: 'error',
      },
      {
        id: '2',
        tool: 'create_transaction',
        domain: 'transaction',
        label: 'x',
        summary: 'y',
        status: 'done',
        targetId: 'tx9',
      },
    ]
    const out = withViewHrefs(actions)
    expect(out[0]?.viewHref).toBeUndefined()
    expect(out[1]?.viewHref).toBe('/transactions?tx=tx9')
  })

  it('uses list href for completed deletes', () => {
    const out = withViewHrefs([
      {
        id: 'd1',
        tool: 'delete_record',
        domain: 'budget',
        label: 'Deleted',
        summary: 'Groceries',
        status: 'done',
        targetId: 'b1',
      },
    ])
    expect(out[0]?.viewHref).toBe('/budgets')
  })
})
