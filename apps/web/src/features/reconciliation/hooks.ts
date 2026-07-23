import { useQuery } from '@tanstack/react-query'
import { fetchLatestReconciliation, fetchReconciliations } from './api'

function reconciliationKey(walletId: string | undefined, userId: string | undefined) {
  return ['balance-reconciliation', walletId, userId] as const
}

function reconciliationsListKey(walletId: string | undefined, userId: string | undefined) {
  return ['balance-reconciliations', walletId, userId] as const
}

export function useLatestReconciliation(walletId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: reconciliationKey(walletId, userId),
    queryFn: () => fetchLatestReconciliation(walletId!, userId!),
    enabled: !!walletId && !!userId,
  })
}

export function useReconciliations(walletId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: reconciliationsListKey(walletId, userId),
    queryFn: () => fetchReconciliations(walletId!, userId!),
    enabled: !!walletId && !!userId,
  })
}
