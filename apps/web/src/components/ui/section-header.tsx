import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

type SectionHeaderProps = {
  title: ReactNode
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
  className?: string
}

/**
 * Bold section title + optional "View all" affordance.
 */
export function SectionHeader({
  title,
  actionLabel = 'View all',
  actionTo,
  onAction,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {actionTo ? (
        <Link
          to={actionTo}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          {actionLabel}
        </Link>
      ) : onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
