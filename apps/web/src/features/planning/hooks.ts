import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { deleteSpendingPlan, fetchSpendingPlan, upsertSpendingPlan } from './api'
import type { SpendingPlanInput } from './types'

function planKey(walletId: string | undefined, month: string) {
  return ['spending-plan', walletId, month] as const
}

export function useSpendingPlan(walletId: string | undefined, month: string) {
  return useQuery({
    queryKey: planKey(walletId, month),
    queryFn: () => fetchSpendingPlan(walletId!, month),
    enabled: !!walletId,
  })
}

export function useUpsertSpendingPlan(walletId: string | undefined) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.session?.user.id)

  return useMutation({
    mutationFn: (input: SpendingPlanInput) => upsertSpendingPlan(walletId!, userId!, input),
    onSuccess: (plan) => queryClient.invalidateQueries({ queryKey: planKey(walletId, plan.month) }),
  })
}

export function useDeleteSpendingPlan(walletId: string | undefined, month: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteSpendingPlan(id),
    onSuccess: (_void, id) => {
      queryClient.setQueryData(planKey(walletId, month), null)
      void queryClient.invalidateQueries({ queryKey: planKey(walletId, month) })
      void queryClient.invalidateQueries({ queryKey: ['plan-shares', id] })
    },
  })
}
