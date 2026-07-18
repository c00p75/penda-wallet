import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useOfflinePending } from '@/pwa/useOfflineQueue'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { WalletSheet } from '@/features/wallets/WalletSheet'
import { captureOverlayOrigin } from '@/lib/overlayOrigin'
import { BellIcon, SquaresFourIcon, TrophyIcon } from '@/components/icons/product'

/**
 * Primary-tab chrome (Home / Budgets / Goals / Analytics): menu, compete,
 * notifications, and profile. Secondary pages use PageHeader instead.
 */
export function AppHeader() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()
  const offlineQueue = useOfflinePending()
  const [walletSheetOpen, setWalletSheetOpen] = useState(false)

  if (!wallet) return null

  const initial =
    (session?.user.user_metadata?.full_name as string | undefined)?.trim()?.[0] ??
    session?.user.email?.[0]?.toUpperCase() ??
    'P'
  const avatarUrl = session?.user.user_metadata?.avatar_url as string | undefined

  return (
    <>
      <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <button
          type="button"
          onClick={(e) => {
            captureOverlayOrigin(e.currentTarget)
            setWalletSheetOpen(true)
          }}
          aria-label="Open menu"
          className="relative grid size-11 place-items-center rounded-2xl bg-card text-foreground shadow-[var(--shadow-soft)] ring-1 ring-border/60 transition-transform active:scale-95"
        >
          <SquaresFourIcon className="size-5" />
          {offlineQueue.pendingCount > 0 && (
            <span
              className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-[var(--apricot)] text-[9px] font-bold text-white"
              title="Waiting to sync"
            >
              {offlineQueue.pendingCount > 9 ? '9+' : offlineQueue.pendingCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          <Link
            to="/challenges"
            aria-label="Compete"
            className="grid size-10 place-items-center rounded-full text-muted-foreground transition-transform active:scale-95"
          >
            <TrophyIcon className="size-5" weight="regular" />
          </Link>
          <Link
            to="/activity"
            aria-label="Notifications"
            className="grid size-10 place-items-center rounded-full text-muted-foreground transition-transform active:scale-95"
          >
            <BellIcon className="size-5" weight="regular" />
          </Link>
          <Link
            to="/profile"
            aria-label="Profile"
            className="relative grid size-11 place-items-center overflow-hidden rounded-full bg-[var(--iris-soft)] text-sm font-semibold text-[var(--iris)] shadow-[var(--shadow-soft)] ring-2 ring-card transition-transform active:scale-95"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              initial.toUpperCase()
            )}
          </Link>
        </div>
      </header>

      <WalletSheet open={walletSheetOpen} onOpenChange={setWalletSheetOpen} />
    </>
  )
}
