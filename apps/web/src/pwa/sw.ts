/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

clientsClaim()

// With registerType 'prompt', the new SW must wait until the user accepts the
// "reload" toast (main.tsx) instead of taking over mid-session — e.g. while a
// receipt photo upload is in flight. workbox-window sends this message when
// the user clicks Reload.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Supabase REST reads: serve from network, fall back to a short-lived cache when offline.
registerRoute(
  ({ url }) => url.pathname.startsWith('/rest/v1/'),
  new NetworkFirst({ cacheName: 'supabase-rest', networkTimeoutSeconds: 4 }),
  'GET',
)

// Supabase Storage (receipt images, avatars): fine to show a stale copy while revalidating.
registerRoute(
  ({ url }) => url.pathname.startsWith('/storage/v1/object/'),
  new StaleWhileRevalidate({ cacheName: 'supabase-storage' }),
  'GET',
)

// AI Edge Functions are never cached, chat/vision/voice/insights require a live network call,
// and a stale or fabricated cached response would be actively misleading here.
registerRoute(
  ({ url }) => url.pathname.startsWith('/functions/v1/'),
  async ({ request }) => fetch(request),
  'POST',
)

interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  notificationId?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = { title: 'Penda', body: 'You have a new insight.', url: '/notifications' }
  try {
    if (event.data) payload = event.data.json()
  } catch {
    // fall back to default payload above
  }

  const targetUrl = payload.url ?? '/notifications'
  const notificationOptions: NotificationOptions & { renotify?: boolean } = {
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || payload.notificationId || undefined,
    renotify: !!payload.tag,
    data: {
      url: targetUrl,
      notificationId: payload.notificationId ?? null,
    },
  }
  event.waitUntil(self.registration.showNotification(payload.title, notificationOptions))
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientsList) {
        client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' })
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data as { url?: string; notificationId?: string | null } | undefined
  const targetUrl = data?.url ?? '/notifications'
  const notificationId = data?.notificationId ?? null

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientsList) {
        if (notificationId) {
          client.postMessage({ type: 'NOTIFICATION_OPENED', notificationId, url: targetUrl })
        }
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client && typeof (client as WindowClient).navigate === 'function') {
            try {
              await (client as WindowClient).navigate(targetUrl)
              return
            } catch {
              // fall through to openWindow
            }
          }
          return
        }
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})
