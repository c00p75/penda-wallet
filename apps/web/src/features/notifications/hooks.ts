import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isPushSubscribed, subscribeToPush } from './api'

export function usePushSubscriptionStatus() {
  return useQuery({
    queryKey: ['push-subscribed'],
    queryFn: isPushSubscribed,
  })
}

export function useSubscribeToPush() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => subscribeToPush(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['push-subscribed'] }),
  })
}
