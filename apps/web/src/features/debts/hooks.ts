import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addPayment, createDebt, deleteDebt, fetchDebts, fetchPayments, updateDebt } from './api'
import type { DebtInput } from './types'

function debtsKey(walletId: string | undefined) {
  return ['debts', walletId] as const
}

function paymentsKey(debtId: string | undefined) {
  return ['debt-payments', debtId] as const
}

export function useDebts(walletId: string | undefined) {
  return useQuery({
    queryKey: debtsKey(walletId),
    queryFn: () => fetchDebts(walletId!),
    enabled: !!walletId,
  })
}

export function useDebtPayments(debtId: string | undefined) {
  return useQuery({
    queryKey: paymentsKey(debtId),
    queryFn: () => fetchPayments(debtId!),
    enabled: !!debtId,
  })
}

export function useCreateDebt(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DebtInput) => createDebt(walletId!, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: debtsKey(walletId) }),
  })
}

export function useUpdateDebt(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DebtInput }) => updateDebt(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: debtsKey(walletId) }),
  })
}

export function useDeleteDebt(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteDebt(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: debtsKey(walletId) }),
  })
}

export function useAddPayment(walletId: string | undefined, debtId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ amountMinor, date }: { amountMinor: number; date: string }) =>
      addPayment(debtId!, amountMinor, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: debtsKey(walletId) })
      queryClient.invalidateQueries({ queryKey: paymentsKey(debtId) })
    },
  })
}
