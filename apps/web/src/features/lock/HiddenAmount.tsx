import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLockStore } from '@/store/lockStore'
import { useAuthStore } from '@/store/authStore'
import { useProfile } from '@/features/profile/hooks'

/**
 * Masks an exact figure until the balance lock is unlocked — or always when
 * blind budgeting is on. When masked it shows a tappable pill (lock) or a
 * soft aura dash (blind mode).
 */
export function HiddenAmount({ children, className }: { children: React.ReactNode; className?: string }) {
  const enabled = useLockStore((s) => s.enabled)
  const unlocked = useLockStore((s) => s.unlocked)
  const promptUnlock = useLockStore((s) => s.promptUnlock)
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
        aria-label="Amount hidden — blind budgeting"
        title="Blind budgeting is on"
      >
        ····
      </span>
    )
  }

  if (!enabled || unlocked) return <>{children}</>

  return (
    <button
      type="button"
      onClick={promptUnlock}
      className={cn('inline-flex items-center gap-1 align-middle text-muted-foreground', className)}
      aria-label="Balance hidden — tap to reveal"
    >
      <span className="tracking-widest" aria-hidden>
        ••••
      </span>
      <Lock className="size-3.5" />
    </button>
  )
}
