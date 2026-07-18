import type { NotificationKind, NotificationPrefs } from './prefs'

export type { NotificationKind, NotificationPrefs }

export interface AppNotification {
  id: string
  user_id: string
  wallet_id: string | null
  kind: NotificationKind
  title: string
  body: string
  href: string
  payload: Record<string, unknown>
  dedupe_key: string | null
  read_at: string | null
  archived_at: string | null
  created_at: string
}

export type NotificationFilter = 'all' | 'unread' | NotificationKind
