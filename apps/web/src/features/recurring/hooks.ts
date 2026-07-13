import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import {
  createRecurringTransaction,
  deleteRecurringTransaction,
  fetchRecurringTransactions,
  setRecurringActive,
  updateRecurringTransaction,
} from './api'
import type { RecurringInput } from './types'

function recurringKey(walletId: string | undefined) {
  return ['recurring-transactions', walletId] as const
}

export function useRecurringTransactions(walletId: string | undefined) {
  return useQuery({
    queryKey: recurringKey(walletId),
    queryFn: () => fetchRecurringTransactions(walletId!),
    enabled: !!walletId,
  })
}

export function useCreateRecurringTransaction(walletId: string | undefined) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.session?.user.id)

  return useMutation({
    mutationFn: (input: RecurringInput) => createRecurringTransaction(walletId!, userId!, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recurringKey(walletId) }),
  })
}

export function useUpdateRecurringTransaction(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecurringInput }) => updateRecurringTransaction(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recurringKey(walletId) }),
  })
}

export function useSetRecurringActive(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setRecurringActive(id, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recurringKey(walletId) }),
  })
}

export function useDeleteRecurringTransaction(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteRecurringTransaction(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recurringKey(walletId) }),
  })
}
