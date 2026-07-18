import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { ChatSheet } from './ChatSheet'
import { useChatStore } from './chatStore'
import { pageContextFromPathname } from './pageContext'

/**
 * The conversation as an ambient layer: one ChatSheet mounted for the whole
 * app so Penda is reachable from any page. Opens as a full-screen surface from
 * the AI button in the bottom nav (see BottomNav).
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

  const pageContext = pageContextFromPathname(location.pathname)

  return (
    <ChatSheet
      // Remount on wallet switch so messages/conversationId never leak across wallets.
      key={wallet.id}
      open={open}
      onOpenChange={setOpen}
      walletId={wallet.id}
      initialInput={prefill}
      autoSend={autoSend}
      onAutoSendConsumed={consumeAutoSend}
      currency={wallet.base_currency}
      pageContext={pageContext}
    />
  )
}
