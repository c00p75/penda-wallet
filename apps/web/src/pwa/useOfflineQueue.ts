import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createTransaction } from '@/features/transactions/api'
import { sendChatMessage } from '@/features/chat/api'
import {
  flushPendingChatMessages,
  flushPendingTransactions,
  listPendingChatMessages,
  listPendingTransactions,
} from './offlineQueue'
import { useOfflinePendingStore } from './offlinePendingStore'

/**
 * Flushes queued offline transactions + chat on reconnect (and on app start).
 * Mount once at the app root — AppHeader/Home only read the shared count.
 */
export function useOfflineQueueSync() {
  const queryClient = useQueryClient()
  const setPendingCount = useOfflinePendingStore((s) => s.setPendingCount)

  const refreshCount = useCallback(async () => {
    const [tx, chat] = await Promise.all([listPendingTransactions(), listPendingChatMessages()])
    setPendingCount(tx.length + chat.length)
  }, [setPendingCount])

  const flush = useCallback(async () => {
    const synced = await flushPendingTransactions(createTransaction)
    if (synced > 0) {
      toast(`Synced ${synced} offline transaction${synced === 1 ? '' : 's'}.`)
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }
    const chatSynced = await flushPendingChatMessages((walletId, text) =>
      sendChatMessage(walletId, text),
    )
    if (chatSynced > 0) {
      toast(`Sent ${chatSynced} queued chat message${chatSynced === 1 ? '' : 's'}.`)
    }
    await refreshCount()
  }, [queryClient, refreshCount])

  useEffect(() => {
    void flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [flush])
}

/** Read/refresh the pending count without registering another flush listener. */
export function useOfflinePending() {
  const pendingCount = useOfflinePendingStore((s) => s.pendingCount)
  const setPendingCount = useOfflinePendingStore((s) => s.setPendingCount)

  const refreshCount = useCallback(async () => {
    setPendingCount((await listPendingTransactions()).length)
  }, [setPendingCount])

  return { pendingCount, refreshCount }
}
