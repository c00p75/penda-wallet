import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addContribution,
  archiveSavingsGoal,
  createSavingsGoal,
  fetchArchivedSavingsGoals,
  fetchContributions,
  fetchSavingsGoals,
  unarchiveSavingsGoal,
  updateSavingsGoal,
  uploadGoalImage,
} from './api'
import type { SavingsGoalInput } from './types'

function goalsKey(walletId: string | undefined) {
  return ['savings-goals', walletId] as const
}

function archivedGoalsKey(walletId: string | undefined) {
  return ['savings-goals-archived', walletId] as const
}

function contributionsKey(goalId: string | undefined) {
  return ['savings-contributions', goalId] as const
}

export function useSavingsGoals(walletId: string | undefined) {
  return useQuery({
    queryKey: goalsKey(walletId),
    queryFn: () => fetchSavingsGoals(walletId!),
    enabled: !!walletId,
  })
}

export function useArchivedSavingsGoals(walletId: string | undefined) {
  return useQuery({
    queryKey: archivedGoalsKey(walletId),
    queryFn: () => fetchArchivedSavingsGoals(walletId!),
    enabled: !!walletId,
  })
}

export function useContributions(goalId: string | undefined) {
  return useQuery({
    queryKey: contributionsKey(goalId),
    queryFn: () => fetchContributions(goalId!),
    enabled: !!goalId,
  })
}

export function useCreateSavingsGoal(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, initialAmountMinor }: { input: SavingsGoalInput; initialAmountMinor: number }) =>
      createSavingsGoal(walletId!, input, initialAmountMinor),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: goalsKey(walletId) }),
  })
}

export function useUpdateSavingsGoal(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SavingsGoalInput }) => updateSavingsGoal(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: goalsKey(walletId) }),
  })
}

export function useArchiveSavingsGoal(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => archiveSavingsGoal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: goalsKey(walletId) })
      queryClient.invalidateQueries({ queryKey: archivedGoalsKey(walletId) })
    },
  })
}

export function useUnarchiveSavingsGoal(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unarchiveSavingsGoal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: goalsKey(walletId) })
      queryClient.invalidateQueries({ queryKey: archivedGoalsKey(walletId) })
    },
  })
}

export function useUploadGoalImage(walletId: string | undefined) {
  return useMutation({
    mutationFn: (file: File) => uploadGoalImage(walletId!, file),
  })
}

export function useAddContribution(walletId: string | undefined, goalId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ amountMinor, date }: { amountMinor: number; date: string }) =>
      addContribution(goalId!, amountMinor, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: goalsKey(walletId) })
      queryClient.invalidateQueries({ queryKey: contributionsKey(goalId) })
    },
  })
}
