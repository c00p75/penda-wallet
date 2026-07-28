import { useMutation, useQueryClient } from '@tanstack/react-query'
import { localDateStr } from '@/lib/dates'
import { supabase } from '@/lib/supabase/client'
import { useCreateTransaction } from '@/features/transactions/hooks'
import { createReconciliation } from './api'
import { BALANCE_ADJUSTMENT_CATEGORY_NAME } from './balanceAdjustment'

function reconciliationKey(walletId: string | undefined, userId: string | undefined) {
  return ['balance-reconciliation', walletId, userId] as const
}

function reconciliationsListKey(walletId: string | undefined, userId: string | undefined) {
  return ['balance-reconciliations', walletId, userId] as const
}

async function fetchBalanceAdjustmentCategoryId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('name', BALANCE_ADJUSTMENT_CATEGORY_NAME)
    .eq('is_system', true)
    .is('wallet_id', null)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
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
      accountId,
    }: {
      computedBalanceMinor: number
      actualBalanceMinor: number
      currency: string
      /** When set, the balancing entry lands on this pocket. */
      accountId?: string | null
    }) => {
      const delta = actualBalanceMinor - computedBalanceMinor
      if (delta !== 0) {
        const categoryId = await fetchBalanceAdjustmentCategoryId()
        await createTransaction.mutateAsync({
          category_id: categoryId,
          amount_minor: Math.abs(delta),
          currency,
          type: delta > 0 ? 'income' : 'expense',
          merchant: null,
          description: 'Balance reconciliation adjustment',
          transaction_date: localDateStr(),
          account_id: accountId ?? null,
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
      // Balancing entry may change ledger / budget progress views.
      queryClient.invalidateQueries({ queryKey: ['transactions', walletId] })
      queryClient.invalidateQueries({ queryKey: ['budget-progress', walletId] })
      queryClient.invalidateQueries({ queryKey: ['categories', walletId] })
    },
  })
}
