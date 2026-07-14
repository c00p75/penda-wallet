import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createChallenge,
  deleteChallenge,
  fetchChallenges,
  fetchLeaderboard,
  joinChallenge,
  leaveChallenge,
} from './api'
import type { ChallengeInput } from './types'

const challengesKey = ['challenges'] as const

function leaderboardKey(challengeId: string | undefined) {
  return ['challenge-leaderboard', challengeId] as const
}

export function useChallenges() {
  return useQuery({ queryKey: challengesKey, queryFn: fetchChallenges })
}

export function useLeaderboard(challengeId: string | undefined) {
  return useQuery({
    queryKey: leaderboardKey(challengeId),
    queryFn: () => fetchLeaderboard(challengeId!),
    enabled: !!challengeId,
  })
}

export function useCreateChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ChallengeInput) => createChallenge(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: challengesKey }),
  })
}

export function useJoinChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (inviteCode: string) => joinChallenge(inviteCode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: challengesKey }),
  })
}

export function useLeaveChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ challengeId, userId }: { challengeId: string; userId: string }) =>
      leaveChallenge(challengeId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: challengesKey }),
  })
}

export function useDeleteChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (challengeId: string) => deleteChallenge(challengeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: challengesKey }),
  })
}
