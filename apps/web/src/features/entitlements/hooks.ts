import { useQuery } from '@tanstack/react-query'
import { fetchEntitlement } from './api'

export function useEntitlement(userId: string | undefined) {
  const query = useQuery({
    queryKey: ['entitlement', userId],
    queryFn: () => fetchEntitlement(userId!),
    enabled: !!userId,
  })

  return { ...query, isPremium: query.data?.plan === 'premium' }
}
