import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveMission,
  createMission,
  fetchArchivedMissions,
  fetchMissions,
  generateMissionSuggestions,
  unarchiveMission,
  updateMissionStatus,
} from './api'
import type { FinancialMissionInput, MissionStatus } from './types'

function missionsKey(walletId: string | undefined) {
  return ['financial-missions', walletId] as const
}

function archivedMissionsKey(walletId: string | undefined) {
  return ['financial-missions-archived', walletId] as const
}

export function useMissions(walletId: string | undefined) {
  return useQuery({
    queryKey: missionsKey(walletId),
    queryFn: () => fetchMissions(walletId!),
    enabled: !!walletId,
  })
}

export function useArchivedMissions(walletId: string | undefined) {
  return useQuery({
    queryKey: archivedMissionsKey(walletId),
    queryFn: () => fetchArchivedMissions(walletId!),
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

export function useGenerateMissions(walletId: string | undefined) {
  return useMutation({
    mutationFn: () => generateMissionSuggestions(walletId!),
  })
}

export function useArchiveMission(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => archiveMission(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: missionsKey(walletId) })
      queryClient.invalidateQueries({ queryKey: archivedMissionsKey(walletId) })
    },
  })
}

export function useUnarchiveMission(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unarchiveMission(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: missionsKey(walletId) })
      queryClient.invalidateQueries({ queryKey: archivedMissionsKey(walletId) })
    },
  })
}
