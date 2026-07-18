import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { formatMoney } from '@/lib/money'
import {
  confirmReceiptAsItems,
  createTransaction,
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
} from './api'
import type { ReceiptItemsConfirmInput, Transaction, TransactionInput } from './types'

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
    onSuccess: (tx) => {
      queryClient.invalidateQueries({ queryKey: transactionsKey(walletId) })
      queryClient.invalidateQueries({ queryKey: ['savings-goals', walletId] })
      const habits = (tx as Transaction & { habits?: { applied?: boolean; contributions?: Array<{ kind: string; amount_minor: number }> } }).habits
      const first = habits?.contributions?.[0]
      if (habits?.applied && first) {
        const label = first.kind === 'round_up' ? 'Rounded up' : 'Paid yourself first'
        toast(`${label} ${formatMoney(first.amount_minor, tx.currency)} → savings`)
      }
    },
  })
}

export function useUpdateTransaction(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input, version }: { id: string; input: TransactionInput; version: number }) =>
      updateTransaction(id, input, version),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionsKey(walletId) }),
    onError: () => queryClient.invalidateQueries({ queryKey: transactionsKey(walletId) }),
  })
}

export function useDeleteTransaction(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionsKey(walletId) }),
  })
}

export function useConfirmReceiptItems(walletId: string | undefined) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.session?.user.id)

  return useMutation({
    mutationFn: ({ draft, input }: { draft: Transaction; input: ReceiptItemsConfirmInput }) =>
      confirmReceiptAsItems(draft, userId!, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transactionsKey(walletId) }),
    onError: () => queryClient.invalidateQueries({ queryKey: transactionsKey(walletId) }),
  })
}
