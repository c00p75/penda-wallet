import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { ChatSheet } from './ChatSheet'
import { useChatStore } from './chatStore'

/**
 * The conversation as an ambient layer: one ChatSheet mounted for the whole
 * app so Penda is reachable from any page. The sheet is opened from the AI
 * button in the center of the bottom nav (see BottomNav) rather than a
 * separate floating handle.
 */
export function AmbientChat() {
  const session = useAuthStore((s) => s.session)
  const location = useLocation()
  const { data: wallet } = useCurrentWallet()

  const open = useChatStore((s) => s.open)
  const prefill = useChatStore((s) => s.prefill)
  const autoSend = useChatStore((s) => s.autoSend)
  const setOpen = useChatStore((s) => s.setOpen)
  const consumeAutoSend = useChatStore((s) => s.consumeAutoSend)

  if (!session || !wallet || location.pathname === '/login') return null

  return (
    <ChatSheet
      open={open}
      onOpenChange={setOpen}
      walletId={wallet.id}
      initialInput={prefill}
      autoSend={autoSend}
      onAutoSendConsumed={consumeAutoSend}
      currency={wallet.base_currency}
    />
  )
}
