import { useMutation, useQueryClient } from '@tanstack/react-query'
import { localDateStr } from '@/lib/dates'
import { useCreateTransaction } from '@/features/transactions/hooks'
import { createReconciliation } from './api'

function reconciliationKey(walletId: string | undefined, userId: string | undefined) {
  return ['balance-reconciliation', walletId, userId] as const
}

function reconciliationsListKey(walletId: string | undefined, userId: string | undefined) {
  return ['balance-reconciliations', walletId, userId] as const
}

/**
 * The single place balance corrections happen: insert a balancing
 * transaction for the delta (if any), then log the event so it shows up in
 * balance history. Shared by the manual balance editor and the daily
 * ReconcilePrompt so both stay behaviorally identical.
 */
export function useSetBalance(walletId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient()
  const createTransaction = useCreateTransaction(walletId)

  return useMutation({
    mutationFn: async ({
      computedBalanceMinor,
      actualBalanceMinor,
      currency,
    }: {
      computedBalanceMinor: number
      actualBalanceMinor: number
      currency: string
    }) => {
      const delta = actualBalanceMinor - computedBalanceMinor
      if (delta !== 0) {
        await createTransaction.mutateAsync({
          category_id: null,
          amount_minor: Math.abs(delta),
          currency,
          type: delta > 0 ? 'income' : 'expense',
          merchant: null,
          description: 'Balance reconciliation adjustment',
          transaction_date: localDateStr(),
        })
      }
      return createReconciliation({
        walletId: walletId!,
        userId: userId!,
        computedBalanceMinor,
        actualBalanceMinor,
        status: delta !== 0 ? 'adjusted' : 'confirmed',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reconciliationKey(walletId, userId) })
      queryClient.invalidateQueries({ queryKey: reconciliationsListKey(walletId, userId) })
    },
  })
}
