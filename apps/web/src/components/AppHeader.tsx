import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CloudOff, MessageCircle, Trophy, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useOfflinePending } from '@/pwa/useOfflineQueue'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useWalletPresence } from '@/features/wallets/useWalletPresence'
import { WalletSheet } from '@/features/wallets/WalletSheet'
import { useChatStore } from '@/features/chat/chatStore'

/**
 * The wallet-switcher header: wallet name/switcher with presence and
 * offline-sync status, Compete, and Notifications. Shared across every
 * tab-level page so wallet context and quick actions are always reachable,
 * not just from Home. Settings lives in the Profile tab-switcher instead of
 * a header shortcut, so it isn't duplicated here.
 */
export function AppHeader() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()
  const openChat = useChatStore((s) => s.openChat)
  const offlineQueue = useOfflinePending()
  const present = useWalletPresence(wallet?.id, session?.user.id, session?.user.email ?? '')
  const [walletSheetOpen, setWalletSheetOpen] = useState(false)

  if (!wallet) return null

  return (
    <>
      <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWalletSheetOpen(true)}
            className="flex items-center gap-2 rounded-full bg-muted py-1.5 pl-3 pr-2.5 text-left"
          >
            <span className="text-sm font-medium">{wallet.name}</span>
            {offlineQueue.pendingCount > 0 && (
              <span
                className="flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground"
                title="Waiting to sync"
              >
                <CloudOff className="size-3" />
                {offlineQueue.pendingCount}
              </span>
            )}
            <span className="flex -space-x-1.5">
              {present.length > 1 ? (
                present.slice(0, 3).map((p) => (
                  <span
                    key={p.userId}
                    title={p.label}
                    className="flex size-5 items-center justify-center rounded-full border-2 border-muted bg-primary text-[9px] font-medium text-primary-foreground"
                  >
                    {p.label.slice(0, 1).toUpperCase()}
                  </span>
                ))
              ) : (
                <Users className="size-4 text-muted-foreground" />
              )}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <Link
            to="/challenges"
            aria-label="Compete"
            className="flex size-9 items-center justify-center rounded-full transition-transform active:scale-95"
          >
            <Trophy className="size-4 text-muted-foreground" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full"
            onClick={() => openChat()}
            aria-label="Ask Penda"
          >
            <MessageCircle className="size-4" />
          </Button>
        </div>
      </header>

      <WalletSheet open={walletSheetOpen} onOpenChange={setWalletSheetOpen} wallet={wallet} />
    </>
  )
}
