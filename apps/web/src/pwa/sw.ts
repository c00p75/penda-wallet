/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()

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
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = { title: 'Penda', body: 'You have a new insight.', url: '/notifications' }
  try {
    if (event.data) payload = event.data.json()
  } catch {
    // fall back to default payload above
  }
  console.log('[sw] push received', payload)

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url ?? '/notifications' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl =
    (event.notification.data as { url?: string } | undefined)?.url ?? '/notifications'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(targetUrl)
    }),
  )
})
