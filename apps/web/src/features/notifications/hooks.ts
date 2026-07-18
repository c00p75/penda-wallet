import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveNotification,
  fetchNotifications,
  fetchUnreadNotificationCount,
  isPushSubscribed,
  markNotificationsRead,
  subscribeToPush,
  unsubscribeFromPush,
  upsertCoachingNotification,
} from './api'

const listKey = ['notifications'] as const
const unreadKey = ['notifications-unread'] as const
const pushKey = ['push-subscribed'] as const

function invalidateNotificationQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: listKey })
  void queryClient.invalidateQueries({ queryKey: unreadKey })
}

export function useNotifications() {
  const query = useQuery({
    queryKey: listKey,
    queryFn: () => fetchNotifications(false),
  })

  useEffect(() => {
    function onFocus() {
      void query.refetch()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [query])

  return query
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: unreadKey,
    queryFn: fetchUnreadNotificationCount,
    refetchInterval: 60_000,
  })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[] | undefined = undefined) => markNotificationsRead(ids),
    onSuccess: () => invalidateNotificationQueries(queryClient),
  })
}

export function useArchiveNotification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => archiveNotification(id),
    onSuccess: () => invalidateNotificationQueries(queryClient),
  })
}

export function usePushSubscriptionStatus() {
  return useQuery({
    queryKey: pushKey,
    queryFn: isPushSubscribed,
  })
}

export function useSubscribeToPush() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => subscribeToPush(userId),
    onSuccess: (_data, userId) => {
      void queryClient.invalidateQueries({ queryKey: pushKey })
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })
}

export function useUnsubscribeFromPush() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => unsubscribeFromPush(userId),
    onSuccess: (_data, userId) => {
      void queryClient.invalidateQueries({ queryKey: pushKey })
      void queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })
}

export function useUpsertCoachingNotification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: upsertCoachingNotification,
    onSuccess: () => invalidateNotificationQueries(queryClient),
  })
}
