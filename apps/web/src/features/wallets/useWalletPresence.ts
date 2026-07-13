import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface PresentUser {
  userId: string
  label: string
}

export function useWalletPresence(walletId: string | undefined, userId: string | undefined, label: string) {
  const [present, setPresent] = useState<PresentUser[]>([])

  useEffect(() => {
    if (!walletId || !userId) return

    const channel = supabase.channel(`wallet-${walletId}-presence`, {
      config: { presence: { key: userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresentUser>()
        setPresent(Object.values(state).flat())
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId, label })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [walletId, userId, label])

  return present
}
