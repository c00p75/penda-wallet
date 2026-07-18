import { useQuery } from '@tanstack/react-query'
import { fetchEntitlement } from './api'

export function useEntitlement(userId: string | undefined) {
  const query = useQuery({
    queryKey: ['entitlement', userId],
    queryFn: () => fetchEntitlement(userId!),
    enabled: !!userId,
  })

  const data = query.data
  const periodOk =
    !data?.current_period_end || new Date(data.current_period_end).getTime() > Date.now()
  const statusOk = !data?.status || data.status === 'active' || data.status === 'trialing'
  const isPremium = data?.plan === 'premium' && periodOk && statusOk

  return { ...query, isPremium }
}
