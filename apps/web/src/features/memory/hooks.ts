import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createMemory, deleteMemory, fetchMemories } from './api'
import type { AiMemoryInput } from './types'

function memoriesKey(userId: string | undefined) {
  return ['ai-memories', userId] as const
}

export function useMemories(userId: string | undefined) {
  return useQuery({
    queryKey: memoriesKey(userId),
    queryFn: () => fetchMemories(userId!),
    enabled: !!userId,
  })
}

export function useCreateMemory(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AiMemoryInput) => createMemory(userId!, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memoriesKey(userId) }),
  })
}

export function useDeleteMemory(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteMemory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memoriesKey(userId) }),
  })
}
