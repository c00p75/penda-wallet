import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useWalletStore } from '@/store/walletStore'
import {
  acceptWalletInvite,
  createWallet,
  createWalletInvite,
  declineWalletInvite,
  deliverWalletInvite,
  fetchMyWalletInvites,
  fetchPendingWalletInvites,
  fetchWallets,
  fetchWalletMembers,
  removeWalletMember,
  revokeWalletInvite,
  updateWallet,
} from './api'
import type { InviteRole, Wallet } from './types'

export function useWallets() {
  const userId = useAuthStore((s) => s.session?.user.id)

  return useQuery({
    queryKey: ['wallets', userId],
    queryFn: () => fetchWallets(userId!),
    enabled: !!userId,
  })
}

export function useCurrentWallet(): { data: Wallet | undefined; isLoading: boolean; wallets: Wallet[] } {
  const { data: wallets = [], isLoading } = useWallets()
  const currentWalletId = useWalletStore((s) => s.currentWalletId)

  const current = wallets.find((w) => w.id === currentWalletId) ?? wallets[0]
  return { data: current, isLoading, wallets }
}

export function useCreateWallet() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, baseCurrency }: { name: string; baseCurrency: string }) =>
      createWallet(name, baseCurrency),
    onSuccess: (wallet) => {
      // Put the wallet in cache immediately so AmbientChat can mount before refetch.
      if (userId) {
        queryClient.setQueryData<Wallet[]>(['wallets', userId], (prev) => {
          const list = prev ?? []
          if (list.some((w) => w.id === wallet.id)) return list
          return [...list, wallet]
        })
      }
      void queryClient.invalidateQueries({ queryKey: ['wallets', userId] })
    },
  })
}

export function useUpdateWallet() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, name, baseCurrency }: { id: string; name: string; baseCurrency: string }) =>
      updateWallet(id, { name, baseCurrency }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wallets', userId] }),
  })
}

export function useWalletMembers(walletId: string | undefined) {
  return useQuery({
    queryKey: ['wallet-members', walletId],
    queryFn: () => fetchWalletMembers(walletId!),
    enabled: !!walletId,
  })
}

export function usePendingWalletInvites(walletId: string | undefined) {
  return useQuery({
    queryKey: ['wallet-invites', walletId],
    queryFn: () => fetchPendingWalletInvites(walletId!),
    enabled: !!walletId,
  })
}

/**
 * Creates (or refreshes) the pending invite row, then triggers delivery
 * (email + in-app notification). Delivery failure doesn't undo the invite,
 * it stays pending so the caller can retry via `useDeliverWalletInvite`.
 */
export function useCreateWalletInvite(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: InviteRole }) =>
      createWalletInvite(walletId!, email, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet-invites', walletId] })
    },
  })
}

export function useDeliverWalletInvite(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (inviteId: string) => deliverWalletInvite(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet-invites', walletId] })
    },
  })
}

export function useRevokeWalletInvite(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (inviteId: string) => revokeWalletInvite(inviteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wallet-invites', walletId] }),
  })
}

/** Pending invites addressed to the current user, across all wallets. */
export function useMyWalletInvites() {
  const userId = useAuthStore((s) => s.session?.user.id)

  return useQuery({
    queryKey: ['my-wallet-invites', userId],
    queryFn: fetchMyWalletInvites,
    enabled: !!userId,
  })
}

export function useAcceptWalletInvite() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (inviteId: string) => acceptWalletInvite(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-wallet-invites', userId] })
      queryClient.invalidateQueries({ queryKey: ['wallets'] })
      queryClient.invalidateQueries({ queryKey: ['wallet-members'] })
    },
  })
}

export function useDeclineWalletInvite() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (inviteId: string) => declineWalletInvite(inviteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-wallet-invites', userId] }),
  })
}

export function useRemoveWalletMember(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => removeWalletMember(walletId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet-members', walletId] })
      queryClient.invalidateQueries({ queryKey: ['wallets'] })
    },
  })
}
