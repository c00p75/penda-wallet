import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sendChatMessage } from './api'

export function useSendChatMessage(walletId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ message, conversationId }: { message: string; conversationId?: string }) =>
      sendChatMessage(walletId!, message, conversationId),
    onSuccess: (data) => {
      if (data.transaction) {
        queryClient.invalidateQueries({ queryKey: ['transactions', walletId] })
      }
    },
  })
}
