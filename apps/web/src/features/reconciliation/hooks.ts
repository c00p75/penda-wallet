import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createReconciliation, fetchLatestReconciliation } from './api'
import type { ReconciliationStatus } from './types'

function reconciliationKey(walletId: string | undefined, userId: string | undefined) {
  return ['balance-reconciliation', walletId, userId] as const
}

export function useLatestReconciliation(walletId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: reconciliationKey(walletId, userId),
    queryFn: () => fetchLatestReconciliation(walletId!, userId!),
    enabled: !!walletId && !!userId,
  })
}

export function useCreateReconciliation(walletId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { computedBalanceMinor: number; actualBalanceMinor: number; status: ReconciliationStatus }) =>
      createReconciliation({ walletId: walletId!, userId: userId!, ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reconciliationKey(walletId, userId) }),
  })
}
