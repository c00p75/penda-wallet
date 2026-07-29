import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useCreateTransaction } from '@/features/transactions/hooks'
import {
  addPayment,
  archiveDebt,
  createDebt,
  deleteDebtPayment,
  fetchArchivedDebts,
  fetchDebts,
  fetchPayments,
  unarchiveDebt,
  updateDebt,
} from './api'
import { DEBT_PAYMENT_CATEGORY_NAME } from './debtPaymentCategory'
import type { DebtDirection, DebtInput } from './types'

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

async function fetchDebtPaymentCategoryId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('name', DEBT_PAYMENT_CATEGORY_NAME)
    .eq('is_system', true)
    .is('wallet_id', null)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

export function useAddPayment(walletId: string | undefined, debtId: string | undefined) {
  const queryClient = useQueryClient()
  const createTransaction = useCreateTransaction(walletId)

  return useMutation({
    mutationFn: async ({
      amountMinor,
      date,
      accountId,
      currency,
      debtName,
      direction,
    }: {
      amountMinor: number
      date: string
      /** Pocket the payment moved through; omitted wallets with no pockets yet. */
      accountId: string | null
      currency: string
      debtName: string
      direction: DebtDirection
    }) => {
      let transactionId: string | null = null
      if (accountId) {
        const categoryId = await fetchDebtPaymentCategoryId()
        const tx = await createTransaction.mutateAsync({
          category_id: categoryId,
          amount_minor: amountMinor,
          currency,
          type: direction === 'i_owe' ? 'expense' : 'income',
          merchant: null,
          description: `Payment: ${debtName}`,
          transaction_date: date,
          account_id: accountId,
        })
        transactionId = tx.id
      }
      return addPayment(debtId!, amountMinor, date, accountId, transactionId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: debtsKey(walletId) })
      queryClient.invalidateQueries({ queryKey: paymentsKey(debtId) })
      queryClient.invalidateQueries({ queryKey: ['transactions', walletId] })
      queryClient.invalidateQueries({ queryKey: ['budget-progress', walletId] })
    },
  })
}

/** Reverses a debt payment (deleting it restores the debt's balance via trigger). */
export function useReverseDebtPayment(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (paymentId: string) => deleteDebtPayment(paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: debtsKey(walletId) })
      queryClient.invalidateQueries({ queryKey: ['transactions', walletId] })
      queryClient.invalidateQueries({ queryKey: ['budget-progress', walletId] })
    },
  })
}
