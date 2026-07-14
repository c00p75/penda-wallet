import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addContribution,
  createSavingsGoal,
  deleteSavingsGoal,
  fetchContributions,
  fetchSavingsGoals,
  updateSavingsGoal,
} from './api'
import type { SavingsGoalInput } from './types'

function goalsKey(walletId: string | undefined) {
  return ['savings-goals', walletId] as const
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

export function useDeleteSavingsGoal(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteSavingsGoal(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: goalsKey(walletId) }),
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
