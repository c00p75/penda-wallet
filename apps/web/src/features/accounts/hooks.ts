import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveAccount,
  createAccount,
  createPocketProvider,
  createPocketType,
  deletePocketProvider,
  deletePocketType,
  fetchAccounts,
  fetchPocketProviders,
  fetchPocketTypes,
  transferBetweenAccounts,
  updateAccount,
  updatePocketProvider,
  updatePocketType,
} from './api'
import type { AccountInput, PocketProviderInput, PocketTypeInput } from './types'

export function accountsKey(walletId: string | undefined) {
  return ['accounts', walletId] as const
}

export function useAccounts(walletId: string | undefined) {
  return useQuery({
    queryKey: accountsKey(walletId),
    queryFn: () => fetchAccounts(walletId!),
    enabled: !!walletId,
  })
}

export function useCreateAccount(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AccountInput) => createAccount(walletId!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountsKey(walletId) })
    },
  })
}

export function useUpdateAccount(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AccountInput> }) =>
      updateAccount(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountsKey(walletId) })
    },
  })
}

export function useArchiveAccount(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => archiveAccount(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountsKey(walletId) })
    },
  })
}

export function useTransferBetweenAccounts(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (
      input: Omit<Parameters<typeof transferBetweenAccounts>[0], 'walletId'> & {
        walletId?: string
      },
    ) =>
      transferBetweenAccounts({
        ...input,
        walletId: input.walletId ?? walletId!,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountsKey(walletId) })
      void queryClient.invalidateQueries({ queryKey: ['transactions', walletId] })
    },
  })
}

export function defaultAccountId(
  accounts: Array<{ id: string; is_default: boolean }> | undefined,
): string | null {
  if (!accounts?.length) return null
  return accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? null
}

export function pocketTypesKey(walletId: string | undefined) {
  return ['pocket-types', walletId] as const
}

export function usePocketTypes(walletId: string | undefined) {
  return useQuery({
    queryKey: pocketTypesKey(walletId),
    queryFn: () => fetchPocketTypes(walletId!),
    enabled: !!walletId,
  })
}

export function useCreatePocketType(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PocketTypeInput) => createPocketType(walletId!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pocketTypesKey(walletId) })
    },
  })
}

export function useUpdatePocketType(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PocketTypeInput }) =>
      updatePocketType(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pocketTypesKey(walletId) })
      void queryClient.invalidateQueries({ queryKey: accountsKey(walletId) })
    },
  })
}

export function useDeletePocketType(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePocketType(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pocketTypesKey(walletId) })
      void queryClient.invalidateQueries({ queryKey: accountsKey(walletId) })
    },
  })
}

export function pocketProvidersKey(walletId: string | undefined) {
  return ['pocket-providers', walletId] as const
}

export function usePocketProviders(walletId: string | undefined) {
  return useQuery({
    queryKey: pocketProvidersKey(walletId),
    queryFn: () => fetchPocketProviders(walletId!),
    enabled: !!walletId,
  })
}

export function useCreatePocketProvider(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PocketProviderInput) => createPocketProvider(walletId!, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pocketProvidersKey(walletId) })
    },
  })
}

export function useUpdatePocketProvider(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PocketProviderInput }) =>
      updatePocketProvider(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pocketProvidersKey(walletId) })
      void queryClient.invalidateQueries({ queryKey: accountsKey(walletId) })
    },
  })
}

export function useDeletePocketProvider(walletId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePocketProvider(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pocketProvidersKey(walletId) })
      void queryClient.invalidateQueries({ queryKey: accountsKey(walletId) })
    },
  })
}
