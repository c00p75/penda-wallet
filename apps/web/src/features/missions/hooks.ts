import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createMission, deleteMission, fetchMissions, updateMissionStatus } from './api'
import type { FinancialMissionInput, MissionStatus } from './types'

function missionsKey(walletId: string | undefined) {
  return ['financial-missions', walletId] as const
}

export function useMissions(walletId: string | undefined) {
  return useQuery({
    queryKey: missionsKey(walletId),
    queryFn: () => fetchMissions(walletId!),
    enabled: !!walletId,
  })
}

export function useCreateMission(walletId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: FinancialMissionInput) => createMission(walletId!, userId!, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: missionsKey(walletId) }),
  })
}

export function useUpdateMissionStatus(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MissionStatus }) => updateMissionStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: missionsKey(walletId) }),
  })
}

export function useDeleteMission(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteMission(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: missionsKey(walletId) }),
  })
}
