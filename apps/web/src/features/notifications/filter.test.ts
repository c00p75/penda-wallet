import { describe, expect, it } from 'vitest'
import type { AppNotification, NotificationFilter } from './types'

function matchesFilter(n: AppNotification, filter: NotificationFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'unread') return !n.read_at
  return n.kind === filter
}

function stub(over: Partial<AppNotification>): AppNotification {
  return {
    id: '1',
    user_id: 'u',
    wallet_id: null,
    kind: 'tip',
    title: 't',
    body: 'b',
    href: '/notifications',
    payload: {},
    dedupe_key: null,
    read_at: null,
    archived_at: null,
    created_at: '2026-07-18T00:00:00.000Z',
    ...over,
  }
}

describe('notification filter', () => {
  it('filters unread and by kind', () => {
    const unreadTip = stub({ id: 'a', kind: 'tip', read_at: null })
    const readAlert = stub({ id: 'b', kind: 'alert', read_at: '2026-07-18T01:00:00.000Z' })
    const items = [unreadTip, readAlert]

    expect(items.filter((n) => matchesFilter(n, 'all'))).toHaveLength(2)
    expect(items.filter((n) => matchesFilter(n, 'unread')).map((n) => n.id)).toEqual(['a'])
    expect(items.filter((n) => matchesFilter(n, 'alert')).map((n) => n.id)).toEqual(['b'])
  })
})
