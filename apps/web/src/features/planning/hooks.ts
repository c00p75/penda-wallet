import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { fetchSpendingPlan, upsertSpendingPlan } from './api'
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
