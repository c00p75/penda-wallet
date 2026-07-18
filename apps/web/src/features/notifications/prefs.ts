/** Mirrors supabase/functions/_shared/notifyPrefs.ts for client + unit tests. */

export type NotificationKind = 'tip' | 'reminder' | 'insight' | 'update' | 'alert'

export type NotificationPrefs = {
  reminders: boolean
  tips: boolean
  insights: boolean
  alerts: boolean
  updates: boolean
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  reminders: true,
  tips: true,
  insights: true,
  alerts: true,
  updates: true,
}

const KIND_TO_PREF: Record<NotificationKind, keyof NotificationPrefs> = {
  tip: 'tips',
  reminder: 'reminders',
  insight: 'insights',
  alert: 'alerts',
  update: 'updates',
}

export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    reminders: obj.reminders !== false,
    tips: obj.tips !== false,
    insights: obj.insights !== false,
    alerts: obj.alerts !== false,
    updates: obj.updates !== false,
  }
}

export function isKindEnabled(prefs: NotificationPrefs, kind: NotificationKind): boolean {
  return prefs[KIND_TO_PREF[kind]] !== false
}

export function shouldSendPush(opts: {
  notificationOptIn: boolean
  prefs: NotificationPrefs
  kind: NotificationKind
  pushRequested: boolean
}): boolean {
  if (!opts.pushRequested) return false
  if (!opts.notificationOptIn) return false
  return isKindEnabled(opts.prefs, opts.kind)
}

export function groupNotificationsByDay<T extends { created_at: string }>(
  items: T[],
  now = new Date(),
): { label: string; items: T[] }[] {
  const today = localDateStr(now)
  const yesterday = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))

  const buckets: Record<'Today' | 'Yesterday' | 'Earlier', T[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  }

  for (const item of items) {
    const day = item.created_at.slice(0, 10)
    if (day === today) buckets.Today.push(item)
    else if (day === yesterday) buckets.Yesterday.push(item)
    else buckets.Earlier.push(item)
  }

  return (['Today', 'Yesterday', 'Earlier'] as const)
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, items: buckets[label] }))
}

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
