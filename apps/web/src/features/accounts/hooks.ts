import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveAccount,
  createAccount,
  fetchAccounts,
  transferBetweenAccounts,
  updateAccount,
} from './api'
import type { AccountInput } from './types'

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
