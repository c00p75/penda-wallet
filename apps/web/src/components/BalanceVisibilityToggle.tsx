import { Eye, EyeOff } from 'lucide-react'
import { useBalanceVisibilityStore, useCardVisible } from '@/store/balanceVisibilityStore'
import { cn } from '@/lib/utils'

/**
 * Icon-only eye toggle for a single card's figure, keyed by `id` — toggling
 * one card never affects any other card's visibility. Unstyled beyond
 * shape/motion — callers pass color/background/position via `className`
 * since this shows up both floating on a colored hero card and inline on a
 * plain page.
 */
export function BalanceVisibilityToggle({ id, className }: { id: string; className?: string }) {
  const visible = useCardVisible(id)
  const toggle = useBalanceVisibilityStore((s) => s.toggle)

  return (
    <button
      type="button"
      aria-label={visible ? 'Hide amount' : 'Show amount'}
      aria-pressed={!visible}
      onClick={(e) => {
        e.stopPropagation()
        toggle(id)
      }}
      className={cn('inline-flex items-center justify-center rounded-full transition-transform active:scale-90', className)}
    >
      {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
    </button>
  )
}
