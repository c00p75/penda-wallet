import { useQuery } from '@tanstack/react-query'
import { fetchCategories } from './api'

export function useCategories(walletId: string | undefined) {
  return useQuery({
    queryKey: ['categories', walletId],
    queryFn: () => fetchCategories(walletId!),
    enabled: !!walletId,
    staleTime: 5 * 60 * 1000,
  })
}
