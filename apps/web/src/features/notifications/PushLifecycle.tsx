import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { recordNotificationOpen, refreshPushSubscription } from './api'

/**
 * Handles service-worker messages for push subscription rotation and
 * notification-open attribution, and refreshes the current device endpoint.
 */
export function PushLifecycle() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return
    void refreshPushSubscription(userId).catch(() => {})
  }, [userId])

  // Cold start from a push notification: the service worker had no window
  // client to postMessage, so it appended ?notif=<id> to the opened URL
  // instead. Record the open here, then strip the param.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const notificationId = params.get('notif')
    if (!notificationId) return

    params.delete('notif')
    const search = params.toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true })

    void recordNotificationOpen(notificationId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] })
        void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
      })
      .catch(() => {})
    // Runs once per landed URL; navigate/queryClient are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    function onMessage(event: MessageEvent) {
      const data = event.data as
        | { type?: string; notificationId?: string; url?: string }
        | undefined
      if (!data?.type) return

      if (data.type === 'PUSH_SUBSCRIPTION_CHANGED' && userId) {
        void refreshPushSubscription(userId)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ['push-subscribed'] })
          })
          .catch(() => {})
        return
      }

      if (data.type === 'NOTIFICATION_OPENED' && data.notificationId) {
        void recordNotificationOpen(data.notificationId)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ['notifications'] })
            void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] })
          })
          .catch(() => {})
        if (data.url && data.url.startsWith('/')) {
          navigate(data.url)
        }
      }
    }

    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [userId, navigate, queryClient])

  return null
}
