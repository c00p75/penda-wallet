import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCategory, deleteCategory, fetchCategories, updateCategory } from './api'
import type { CategoryInput } from './types'

function categoriesKey(walletId: string | undefined) {
  return ['categories', walletId] as const
}

export function useCategories(walletId: string | undefined) {
  return useQuery({
    queryKey: categoriesKey(walletId),
    queryFn: () => fetchCategories(walletId!),
    enabled: !!walletId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateCategory(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CategoryInput) => createCategory(walletId!, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoriesKey(walletId) }),
  })
}

export function useUpdateCategory(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CategoryInput }) => updateCategory(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoriesKey(walletId) }),
  })
}

export function useDeleteCategory(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      // Deleting a category cascades to its budgets and categorization
      // rules server-side — refresh those views too, not just the list.
      queryClient.invalidateQueries({ queryKey: categoriesKey(walletId) })
      queryClient.invalidateQueries({ queryKey: ['budgets', walletId] })
      queryClient.invalidateQueries({ queryKey: ['budget-progress', walletId] })
      queryClient.invalidateQueries({ queryKey: ['transactions', walletId] })
    },
  })
}
