import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchLatestWeeklyLetter,
  fetchPendingCheckins,
  respondToCheckin,
  type CheckinStatus,
} from './api'

export function useCompanionCheckins(walletId: string | undefined) {
  return useQuery({
    queryKey: ['companion-checkins', walletId],
    queryFn: () => fetchPendingCheckins(walletId!),
    enabled: !!walletId,
    staleTime: 30_000,
  })
}

export function useLatestWeeklyLetter(walletId: string | undefined) {
  return useQuery({
    queryKey: ['companion-letter', walletId],
    queryFn: () => fetchLatestWeeklyLetter(walletId!),
    enabled: !!walletId,
    staleTime: 60_000,
  })
}

export function useRespondToCheckin(walletId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Exclude<CheckinStatus, 'pending'> }) =>
      respondToCheckin(id, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['companion-checkins', walletId] })
    },
  })
}
