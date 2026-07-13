import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { createTransaction, deleteTransaction, fetchTransactions, updateTransaction } from './api'
import type { TransactionInput } from './types'

function transactionsKey(walletId: string | undefined) {
  return ['transactions', walletId] as const
}

export function useTransactions(walletId: string | undefined) {
  return useQuery({
    queryKey: transactionsKey(walletId),
    queryFn: () => fetchTransactions(walletId!),
    enabled: !!walletId,
  })
}

export function useCreateTransaction(walletId: string | undefined) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.session?.user.id)

  return useMutation({
    mutationFn: (input: TransactionInput) => createTransaction(walletId!, userId!, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionsKey(walletId) }),
  })
}

export function useUpdateTransaction(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TransactionInput }) =>
      updateTransaction(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionsKey(walletId) }),
  })
}

export function useDeleteTransaction(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionsKey(walletId) }),
  })
}
