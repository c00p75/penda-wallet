import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveChallenge,
  createChallenge,
  fetchArchivedChallenges,
  fetchChallenges,
  fetchLeaderboard,
  joinChallenge,
  leaveChallenge,
  unarchiveChallenge,
} from './api'
import type { ChallengeInput } from './types'

const challengesKey = ['challenges'] as const
const archivedChallengesKey = ['challenges-archived'] as const

function leaderboardKey(challengeId: string | undefined) {
  return ['challenge-leaderboard', challengeId] as const
}

export function useChallenges() {
  return useQuery({ queryKey: challengesKey, queryFn: fetchChallenges })
}

export function useArchivedChallenges() {
  return useQuery({ queryKey: archivedChallengesKey, queryFn: fetchArchivedChallenges })
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

export function useArchiveChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (challengeId: string) => archiveChallenge(challengeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: challengesKey })
      queryClient.invalidateQueries({ queryKey: archivedChallengesKey })
    },
  })
}

export function useUnarchiveChallenge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (challengeId: string) => unarchiveChallenge(challengeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: challengesKey })
      queryClient.invalidateQueries({ queryKey: archivedChallengesKey })
    },
  })
}
