import { useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { ChatSheet } from './ChatSheet'
import { useChatStore } from './chatStore'
import { pageContextFromPathname } from './pageContext'

/**
 * The conversation as an ambient layer: one ChatSheet mounted for the whole
 * app so Penda is reachable from any page. Opens as a full-screen or quick
 * half-sheet from Ask Penda / insights / voice capture.
 */
export function AmbientChat() {
  const session = useAuthStore((s) => s.session)
  const location = useLocation()
  const { data: wallet } = useCurrentWallet()
  const { data: transactions = [] } = useTransactions(wallet?.id)

  const open = useChatStore((s) => s.open)
  const prefill = useChatStore((s) => s.prefill)
  const autoSend = useChatStore((s) => s.autoSend)
  const mode = useChatStore((s) => s.mode)
  const startRecording = useChatStore((s) => s.startRecording)
  const newTopicNonce = useChatStore((s) => s.newTopicNonce)
  const setOpen = useChatStore((s) => s.setOpen)
  const setMode = useChatStore((s) => s.setMode)
  const consumeAutoSend = useChatStore((s) => s.consumeAutoSend)
  const consumeStartRecording = useChatStore((s) => s.consumeStartRecording)
  const startNewTopic = useChatStore((s) => s.startNewTopic)

  if (!session || !wallet || location.pathname === '/login') return null

  const pageContext = pageContextFromPathname(location.pathname)
  const isFirstRun = transactions.length === 0

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
      mode={mode}
      onModeChange={setMode}
      startRecording={startRecording}
      onStartRecordingConsumed={consumeStartRecording}
      newTopicNonce={newTopicNonce}
      onNewTopic={startNewTopic}
      currency={wallet.base_currency}
      pageContext={pageContext}
      isFirstRun={isFirstRun}
    />
  )
}
