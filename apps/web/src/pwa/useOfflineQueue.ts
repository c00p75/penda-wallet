import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createTransaction } from '@/features/transactions/api'
import { flushPendingTransactions, listPendingTransactions } from './offlineQueue'

/**
 * Flushes queued offline transactions on reconnect (and on app start), and
 * exposes the current pending count for a "pending sync" badge.
 */
export function useOfflineQueue() {
  const queryClient = useQueryClient()
  const [pendingCount, setPendingCount] = useState(0)

  const refreshCount = useCallback(async () => {
    setPendingCount((await listPendingTransactions()).length)
  }, [])

  const flush = useCallback(async () => {
    const synced = await flushPendingTransactions(createTransaction)
    if (synced > 0) {
      toast(`Synced ${synced} offline transaction${synced === 1 ? '' : 's'}.`)
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }
    await refreshCount()
  }, [queryClient, refreshCount])

  useEffect(() => {
    void flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [flush])

  return { pendingCount, refreshCount, flush }
}
