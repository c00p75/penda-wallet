import { Lock } from '@/components/icons/product'
import { cn } from '@/lib/utils'
import { captureOverlayOrigin } from '@/lib/overlayOrigin'
import { useLockStore } from '@/store/lockStore'
import { useAuthStore } from '@/store/authStore'
import { useProfile } from '@/features/profile/hooks'
import { useBalanceVisibilityStore, useCardVisible } from '@/store/balanceVisibilityStore'

/**
 * Masks an exact figure until the balance lock is unlocked, always when
 * blind budgeting is on, or while this card's own eye-icon toggle is off
 * (pass `id` to opt into that — each id's toggle only affects that id).
 * When masked it shows a tappable pill (lock), a soft aura dash (blind
 * mode), or a tap-to-reveal dash (eye toggle).
 */
export function HiddenAmount({
  children,
  className,
  id,
}: {
  children: React.ReactNode
  className?: string
  /** Ties this amount to one card's eye-icon toggle (see BalanceVisibilityToggle). Omit to skip that check. */
  id?: string
}) {
  const enabled = useLockStore((s) => s.enabled)
  const unlocked = useLockStore((s) => s.unlocked)
  const promptUnlock = useLockStore((s) => s.promptUnlock)
  const cardVisible = useCardVisible(id ?? '')
  const toggleCard = useBalanceVisibilityStore((s) => s.toggle)
  const userId = useAuthStore((s) => s.session?.user.id)
  const { data: profile } = useProfile(userId)
  const blind = !!profile?.blind_budgeting

  if (blind) {
    return (
      <span
        className={cn(
          'inline-flex items-center align-middle tracking-widest text-muted-foreground',
          className,
        )}
        aria-label="Amount hidden, blind budgeting"
        title="Blind budgeting is on"
      >
        ••••
      </span>
    )
  }

  if (enabled && !unlocked) {
    return (
      <button
        type="button"
        onClick={(e) => {
          captureOverlayOrigin(e.currentTarget)
          promptUnlock()
        }}
        className={cn('inline-flex items-center gap-1 align-middle text-muted-foreground', className)}
        aria-label="Balance hidden, tap to reveal"
      >
        <span className="tracking-widest" aria-hidden>
          ••••
        </span>
        <Lock className="size-3.5" weight="fill" />
      </button>
    )
  }

  if (id && !cardVisible) {
    return (
      <button
        type="button"
        onClick={() => toggleCard(id)}
        className={cn('inline-flex items-center align-middle tracking-widest text-muted-foreground', className)}
        aria-label="Amount hidden, tap to reveal"
      >
        ••••
      </button>
    )
  }

  return <>{children}</>
}
