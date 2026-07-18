import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFS,
  groupNotificationsByDay,
  isKindEnabled,
  normalizeNotificationPrefs,
  shouldSendPush,
} from './prefs'

describe('normalizeNotificationPrefs', () => {
  it('defaults missing keys to true', () => {
    expect(normalizeNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS)
    expect(normalizeNotificationPrefs({ reminders: false })).toMatchObject({
      reminders: false,
      tips: true,
      insights: true,
      alerts: true,
      updates: true,
      morning_minute: true,
      annual_recap: true,
    })
  })
})

describe('shouldSendPush', () => {
  it('requires opt-in, category, and pushRequested', () => {
    const prefs = DEFAULT_NOTIFICATION_PREFS
    expect(
      shouldSendPush({
        notificationOptIn: true,
        prefs,
        kind: 'alert',
        pushRequested: true,
      }),
    ).toBe(true)

    expect(
      shouldSendPush({
        notificationOptIn: false,
        prefs,
        kind: 'alert',
        pushRequested: true,
      }),
    ).toBe(false)

    expect(
      shouldSendPush({
        notificationOptIn: true,
        prefs: { ...prefs, alerts: false },
        kind: 'alert',
        pushRequested: true,
      }),
    ).toBe(false)

    expect(
      shouldSendPush({
        notificationOptIn: true,
        prefs,
        kind: 'alert',
        pushRequested: false,
      }),
    ).toBe(false)
  })
})

describe('isKindEnabled', () => {
  it('maps kinds to pref keys', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, tips: false, reminders: true }
    expect(isKindEnabled(prefs, 'tip')).toBe(false)
    expect(isKindEnabled(prefs, 'reminder')).toBe(true)
  })
})

describe('groupNotificationsByDay', () => {
  it('buckets into Today, Yesterday, Earlier', () => {
    const now = new Date(2026, 6, 18, 12) // local Jul 18 2026
    const localItems = [
      { id: '1', created_at: '2026-07-18T08:00:00.000Z' },
      { id: '2', created_at: '2026-07-17T08:00:00.000Z' },
      { id: '3', created_at: '2026-07-01T08:00:00.000Z' },
    ]
    const groups = groupNotificationsByDay(localItems, now)
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Earlier'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['1'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['2'])
    expect(groups[2].items.map((i) => i.id)).toEqual(['3'])
  })
})
