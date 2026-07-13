import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dismissInsight, fetchInsights } from './api'

export function useInsights(walletId: string | undefined) {
  return useQuery({
    queryKey: ['insights', walletId],
    queryFn: () => fetchInsights(walletId!),
    enabled: !!walletId,
  })
}

export function useDismissInsight(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => dismissInsight(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insights', walletId] }),
  })
}
