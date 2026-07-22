import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { confirmAiAction, sendChatMessage } from './api'
import type { ChatResponse } from './types'
import type { PageContext } from './pageContext'

/** Shared cache bust after a chat turn creates/updates records. */
export function invalidateAfterChatResponse(
  queryClient: QueryClient,
  walletId: string | undefined,
  data: ChatResponse,
) {
  if (data.transaction) {
    queryClient.invalidateQueries({ queryKey: ['transactions', walletId] })
    queryClient.invalidateQueries({ queryKey: ['insights', walletId] })
  }
  for (const action of data.actions ?? []) {
    if (action.status === 'done') invalidateForDomain(queryClient, action.domain, walletId)
  }
}

export function useSendChatMessage(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      message,
      conversationId,
      pageContext,
    }: {
      message: string
      conversationId?: string
      pageContext?: PageContext
    }) => sendChatMessage(walletId!, message, conversationId, pageContext),
    onSuccess: (data) => invalidateAfterChatResponse(queryClient, walletId, data),
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
    case 'reconciliation':
      // Prefix match also busts ['balance-reconciliation', walletId, userId].
      keys.push(
        ['balance-reconciliation', walletId],
        ['transactions', walletId],
        ['budget-progress', walletId],
      )
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
