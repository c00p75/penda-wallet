import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchProfile, updateProfile } from './api'
import type { ProfileInput } from './types'

function profileKey(userId: string | undefined) {
  return ['profile', userId] as const
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: profileKey(userId),
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  })
}

export function useUpdateProfile(userId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProfileInput) => updateProfile(userId!, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(userId) }),
  })
}
