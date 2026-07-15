import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLockStore } from '@/store/lockStore'

/**
 * Masks an exact figure until the balance lock is unlocked. When the lock is off
 * or already unlocked it renders the children untouched; otherwise it shows a
 * tappable masked pill that opens the unlock sheet.
 */
export function HiddenAmount({ children, className }: { children: React.ReactNode; className?: string }) {
  const enabled = useLockStore((s) => s.enabled)
  const unlocked = useLockStore((s) => s.unlocked)
  const promptUnlock = useLockStore((s) => s.promptUnlock)

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
