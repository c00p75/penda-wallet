import { supabase } from '@/lib/supabase/client'
import { DEFAULT_NOTIFICATION_PREFS, normalizeNotificationPrefs } from './prefs'
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
  if (!('serviceWorker' in navigator)) return false
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return !!subscription
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
    { user_id: userId, endpoint: json.endpoint!, keys: json.keys },
    { onConflict: 'endpoint' },
  )
  if (error) throw error

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ notification_opt_in: true })
    .eq('id', userId)
  if (profileError) throw profileError
}

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

  const { error } = await supabase
    .from('profiles')
    .update({ notification_opt_in: false })
    .eq('id', userId)
  if (error) throw error
}

export { DEFAULT_NOTIFICATION_PREFS, normalizeNotificationPrefs }
