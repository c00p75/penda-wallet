import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchFeatureVisits, recordFeatureVisit } from './api'

function featureVisitsKey(walletId: string | undefined) {
  return ['feature-visits', walletId] as const
}

export function useFeatureVisits(walletId: string | undefined) {
  return useQuery({
    queryKey: featureVisitsKey(walletId),
    queryFn: () => fetchFeatureVisits(walletId!),
    enabled: !!walletId,
  })
}

export function useRecordFeatureVisit(walletId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (page: string) => recordFeatureVisit(walletId!, userId!, page),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: featureVisitsKey(walletId) }),
  })
}
