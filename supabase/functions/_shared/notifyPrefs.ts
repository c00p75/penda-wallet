/** Notification category prefs, kept in sync with profiles.notification_prefs. */

export type NotificationKind = 'tip' | 'reminder' | 'insight' | 'update' | 'alert'

export type NotificationPrefs = {
  reminders: boolean
  tips: boolean
  insights: boolean
  alerts: boolean
  updates: boolean
  morning_minute: boolean
  annual_recap: boolean
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  reminders: true,
  tips: true,
  insights: true,
  alerts: true,
  updates: true,
  morning_minute: true,
  annual_recap: true,
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
    morning_minute: obj.morning_minute !== false,
    annual_recap: obj.annual_recap !== false,
  }
}

/** Whether this kind should be inserted into the inbox (and eligible for push). */
export function isKindEnabled(prefs: NotificationPrefs, kind: NotificationKind): boolean {
  return prefs[KIND_TO_PREF[kind]] !== false
}

/**
 * Push fires only when the master opt-in is on, the category is enabled, and
 * the caller did not explicitly disable push.
 */
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
