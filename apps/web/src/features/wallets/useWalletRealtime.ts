import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

/**
 * Keeps the transactions list in sync across every member of a shared
 * wallet. Uses Realtime Broadcast (via a `broadcast_changes` trigger +
 * RLS on realtime.messages) rather than the classic postgres_changes path —
 * the latter's wal2json replication slot was not reliably streaming on
 * this project, while Broadcast is Supabase's current recommended approach.
 * Aggregates (balances, budgets) are always recomputed from a refetch
 * rather than merged client-side, so a missed event never leaves two
 * members looking at different numbers.
 */
export function useWalletRealtime(walletId: string | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!walletId) return

    let cancelled = false

    const channel = supabase.channel(`wallet:${walletId}`, {
      config: { private: true },
    })

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', walletId] })
    }

    channel
      .on('broadcast', { event: 'INSERT' }, invalidate)
      .on('broadcast', { event: 'UPDATE' }, invalidate)
      .on('broadcast', { event: 'DELETE' }, invalidate)

    void supabase.realtime.setAuth().then(() => {
      if (!cancelled) channel.subscribe()
    })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [walletId, queryClient])
}
