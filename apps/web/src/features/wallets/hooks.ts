import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { fetchOrCreateDefaultWallet } from './api'

export function useDefaultWallet() {
  const userId = useAuthStore((s) => s.session?.user.id)

  return useQuery({
    queryKey: ['default-wallet', userId],
    queryFn: () => fetchOrCreateDefaultWallet(userId!),
    enabled: !!userId,
    staleTime: Infinity,
  })
}
