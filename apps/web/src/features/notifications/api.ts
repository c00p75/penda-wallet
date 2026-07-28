import { supabase } from '@/lib/supabase/client'
import { DEFAULT_NOTIFICATION_PREFS, normalizeNotificationPrefs } from './prefs'
import { detectBrowserTimezone } from './timezoneClock'
import type { AppNotification } from './types'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export async function fetchNotifications(includeArchived = false): Promise<AppNotification[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (!includeArchived) {
    query = query.is('archived_at', null)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as AppNotification[]
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
    .is('archived_at', null)

  if (error) throw error
  return count ?? 0
}

export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('mark_notifications_read', {
    p_ids: ids?.length ? ids : null,
  })
  if (error) throw error
  return Number(data ?? 0)
}

export async function recordNotificationOpen(id: string): Promise<void> {
  const { error } = await supabase.rpc('record_notification_open', { p_id: id })
  if (error) throw error
}

export async function archiveNotification(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ archived_at: new Date().toISOString(), read_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function upsertCoachingNotification(input: {
  walletId: string
  title: string
  body: string
  href: string
  dedupeKey: string
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('upsert_coaching_notification', {
    p_wallet_id: input.walletId,
    p_title: input.title,
    p_body: input.body,
    p_href: input.href,
    p_dedupe_key: input.dedupeKey,
  })
  if (error) throw error
  return (data as string | null) ?? null
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return false
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return !!subscription
}

async function syncTimezone(userId: string) {
  const timezone = detectBrowserTimezone()
  if (!timezone) return
  await supabase.from('profiles').update({ timezone }).eq('id', userId)
}

export async function subscribeToPush(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Push is not configured (missing VAPID public key).')
  }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
  }

  const json = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint!,
      keys: json.keys,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null,
      last_seen_at: new Date().toISOString(),
      failure_count: 0,
      disabled_at: null,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      notification_opt_in: true,
      timezone: detectBrowserTimezone(),
    })
    .eq('id', userId)
  if (profileError) throw profileError
}

/**
 * Unsubscribe this browser only. Master opt-in stays on if other devices remain.
 */
export async function unsubscribeFromPush(userId: string): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    }
  }

  const { count, error: countError } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('disabled_at', null)
  if (countError) throw countError

  if ((count ?? 0) === 0) {
    const { error } = await supabase
      .from('profiles')
      .update({ notification_opt_in: false })
      .eq('id', userId)
    if (error) throw error
  } else {
    await syncTimezone(userId)
  }
}

/** Re-upsert the current browser subscription after SW rotation. */
export async function refreshPushSubscription(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (!VAPID_PUBLIC_KEY) return

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    if (Notification.permission !== 'granted') return
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
  }

  const json = subscription.toJSON()
  if (!json.endpoint) return

  await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      keys: json.keys,
      user_agent: navigator.userAgent.slice(0, 400),
      last_seen_at: new Date().toISOString(),
      disabled_at: null,
    },
    { onConflict: 'endpoint' },
  )
}

export { DEFAULT_NOTIFICATION_PREFS, normalizeNotificationPrefs }
