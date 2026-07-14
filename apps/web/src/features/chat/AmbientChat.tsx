import { useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronUp, Mic } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useEntitlement } from '@/features/entitlements/hooks'
import { PaywallSheet } from '@/features/entitlements/PaywallSheet'
import { ChatSheet } from './ChatSheet'
import { useChatStore } from './chatStore'

/**
 * The conversation as an ambient layer: one ChatSheet mounted for the whole
 * app plus a pull-up handle so the ask bar is reachable from any page, not a
 * separate screen. The ledger has its own richer ask bar, so the handle hides
 * there to avoid a double affordance.
 */
export function AmbientChat() {
  const session = useAuthStore((s) => s.session)
  const location = useLocation()
  const { data: wallet } = useCurrentWallet()
  const { isPremium } = useEntitlement(session?.user.id)

  const open = useChatStore((s) => s.open)
  const prefill = useChatStore((s) => s.prefill)
  const setOpen = useChatStore((s) => s.setOpen)
  const openChat = useChatStore((s) => s.openChat)

  const [voicePaywallOpen, setVoicePaywallOpen] = useState(false)

  if (!session || !wallet || location.pathname === '/login') return null

  const showHandle = location.pathname !== '/'

  return (
    <>
      {showHandle && <PullUpHandle onOpen={() => openChat()} />}

      <ChatSheet
        open={open}
        onOpenChange={setOpen}
        walletId={wallet.id}
        initialInput={prefill}
        isVoicePremium={isPremium}
        onRequireVoicePremium={() => setVoicePaywallOpen(true)}
      />

      <PaywallSheet
        feature={voicePaywallOpen ? 'voice' : null}
        onOpenChange={(o) => !o && setVoicePaywallOpen(false)}
      />
    </>
  )
}

function PullUpHandle({ onOpen }: { onOpen: () => void }) {
  const startY = useRef<number | null>(null)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center">
      <button
        type="button"
        aria-label="Ask Penda"
        onPointerDown={(e) => {
          startY.current = e.clientY
        }}
        onPointerUp={(e) => {
          const dy = startY.current != null ? e.clientY - startY.current : 0
          startY.current = null
          // A tap or an upward drag opens; a downward drag is ignored.
          if (dy < 8) onOpen()
        }}
        className="pointer-events-auto flex touch-none items-center gap-2 rounded-full border bg-card/90 py-2 pl-3 pr-1.5 text-sm font-medium shadow-lg backdrop-blur"
      >
        <ChevronUp className="size-4 text-muted-foreground" />
        Ask Penda
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Mic className="size-3.5" />
        </span>
      </button>
    </div>
  )
}
