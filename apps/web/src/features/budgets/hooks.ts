import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createBudget, deleteBudget, fetchBudgetProgress, fetchBudgets, updateBudget } from './api'
import type { BudgetInput } from './types'

function budgetsKey(walletId: string | undefined) {
  return ['budgets', walletId] as const
}

function budgetProgressKey(walletId: string | undefined) {
  return ['budget-progress', walletId] as const
}

export function useBudgets(walletId: string | undefined) {
  return useQuery({
    queryKey: budgetsKey(walletId),
    queryFn: () => fetchBudgets(walletId!),
    enabled: !!walletId,
  })
}

export function useBudgetProgress(walletId: string | undefined) {
  return useQuery({
    queryKey: budgetProgressKey(walletId),
    queryFn: () => fetchBudgetProgress(walletId!),
    enabled: !!walletId,
  })
}

function invalidateBudgets(queryClient: ReturnType<typeof useQueryClient>, walletId: string | undefined) {
  queryClient.invalidateQueries({ queryKey: budgetsKey(walletId) })
  queryClient.invalidateQueries({ queryKey: budgetProgressKey(walletId) })
}

export function useCreateBudget(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BudgetInput) => createBudget(walletId!, input),
    onSuccess: () => invalidateBudgets(queryClient, walletId),
  })
}

export function useUpdateBudget(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BudgetInput }) => updateBudget(id, input),
    onSuccess: () => invalidateBudgets(queryClient, walletId),
  })
}

export function useDeleteBudget(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteBudget(id),
    onSuccess: () => invalidateBudgets(queryClient, walletId),
  })
}
