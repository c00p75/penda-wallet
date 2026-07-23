import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addPayment,
  archiveDebt,
  createDebt,
  fetchArchivedDebts,
  fetchDebts,
  fetchPayments,
  unarchiveDebt,
  updateDebt,
} from './api'
import type { DebtInput } from './types'

function debtsKey(walletId: string | undefined) {
  return ['debts', walletId] as const
}

function archivedDebtsKey(walletId: string | undefined) {
  return ['debts-archived', walletId] as const
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

export function useArchivedDebts(walletId: string | undefined) {
  return useQuery({
    queryKey: archivedDebtsKey(walletId),
    queryFn: () => fetchArchivedDebts(walletId!),
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

export function useArchiveDebt(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => archiveDebt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: debtsKey(walletId) })
      queryClient.invalidateQueries({ queryKey: archivedDebtsKey(walletId) })
    },
  })
}

export function useUnarchiveDebt(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unarchiveDebt(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: debtsKey(walletId) })
      queryClient.invalidateQueries({ queryKey: archivedDebtsKey(walletId) })
    },
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
