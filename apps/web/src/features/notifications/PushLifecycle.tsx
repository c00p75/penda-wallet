import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return
    void refreshPushSubscription(userId).catch(() => {})
  }, [userId])

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
