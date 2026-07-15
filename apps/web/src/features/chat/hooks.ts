import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { confirmAiAction, sendChatMessage } from './api'

export function useSendChatMessage(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ message, conversationId }: { message: string; conversationId?: string }) =>
      sendChatMessage(walletId!, message, conversationId),
    onSuccess: (data) => {
      if (data.transaction) {
        queryClient.invalidateQueries({ queryKey: ['transactions', walletId] })
        queryClient.invalidateQueries({ queryKey: ['insights', walletId] })
      }
    },
  })
}

// Which cached queries a confirmed change touches, so the ledger/budgets/etc.
// refetch the moment the user taps Yes.
function invalidateForDomain(queryClient: QueryClient, domain: string, walletId: string | undefined) {
  const keys: unknown[][] = [['insights', walletId]]
  switch (domain) {
    case 'transaction':
      keys.push(['transactions', walletId], ['budget-progress', walletId])
      break
    case 'debt':
      keys.push(['debts', walletId])
      break
    case 'budget':
      keys.push(['budgets', walletId], ['budget-progress', walletId])
      break
    case 'goal':
      keys.push(['savings-goals', walletId])
      break
    case 'category':
      keys.push(['categories', walletId], ['transactions', walletId])
      break
    case 'wallet':
      keys.push(['wallets'])
      break
  }
  for (const key of keys) queryClient.invalidateQueries({ queryKey: key })
}

export function useConfirmAiAction(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ actionId, decision }: { actionId: string; decision: 'confirm' | 'cancel' }) =>
      confirmAiAction(actionId, decision),
    onSuccess: (data) => {
      if (data.ok) invalidateForDomain(queryClient, data.domain, walletId)
    },
  })
}
