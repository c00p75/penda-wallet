import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchWalletSplits,
  markSharesSettled,
  recordSettlementPayment,
} from './api'

function splitsKey(walletId: string | undefined) {
  return ['expense-splits', walletId] as const
}

export function useWalletSplits(walletId: string | undefined) {
  return useQuery({
    queryKey: splitsKey(walletId),
    queryFn: () => fetchWalletSplits(walletId!),
    enabled: !!walletId,
  })
}

export function useMarkSharesSettled(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (shareIds: string[]) => markSharesSettled(shareIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: splitsKey(walletId) }),
  })
}

export function useRecordSettlement(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: recordSettlementPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: splitsKey(walletId) })
      queryClient.invalidateQueries({ queryKey: ['transactions', walletId] })
    },
  })
}
