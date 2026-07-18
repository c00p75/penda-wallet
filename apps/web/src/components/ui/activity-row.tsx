import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cardAccentClass, type CardAccent } from '@/components/ui/cardAccent'

type ActivityRowProps = {
  avatar?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  action?: ReactNode
  onClick?: () => void
  className?: string
  showChevron?: boolean
  /** Soft colored edge; omit for neutral border. */
  accent?: CardAccent
}

/**
 * List row: avatar/emoji + title + subtitle + right-side action.
 * Mirrors the doctor/contact rows in the reference design.
 */
export function ActivityRow({
  avatar,
  title,
  subtitle,
  trailing,
  action,
  onClick,
  className,
  showChevron = false,
  accent,
}: ActivityRowProps) {
  const Comp = onClick ? 'button' : 'div'

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl bg-card px-3 py-3 text-left shadow-[var(--shadow-soft)]',
        cardAccentClass(accent),
        onClick && 'transition-transform active:scale-[0.99]',
        className,
      )}
    >
      {avatar != null && (
        <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-lg">
          {avatar}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {subtitle != null && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {trailing != null && (
        <div className="shrink-0 text-right text-sm font-semibold tabular-nums">{trailing}</div>
      )}
      {action != null ? (
        <div className="shrink-0">{action}</div>
      ) : showChevron ? (
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <ChevronRight className="size-4" />
        </span>
      ) : null}
    </Comp>
  )
}
