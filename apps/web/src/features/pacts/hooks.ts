import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { createPact, deletePact, fetchPacts } from './api'
import type { CommitmentPactInput } from './types'

function pactsKey(walletId: string | undefined) {
  return ['commitment-pacts', walletId] as const
}

export function usePacts(walletId: string | undefined) {
  return useQuery({
    queryKey: pactsKey(walletId),
    queryFn: () => fetchPacts(walletId!),
    enabled: !!walletId,
  })
}

export function useCreatePact(walletId: string | undefined) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.session?.user.id)

  return useMutation({
    mutationFn: (input: CommitmentPactInput) => createPact(walletId!, userId!, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pactsKey(walletId) }),
  })
}

export function useDeletePact(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePact(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pactsKey(walletId) }),
  })
}
