import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title?: ReactNode
  subtitle?: ReactNode
  /** Link target for back. Defaults to history back. */
  backTo?: string
  backLabel?: string
  trailing?: ReactNode
  /** Large display title (secondary hubs) vs compact bar title (detail pages). */
  size?: 'display' | 'compact'
  className?: string
}

const backClassName =
  'size-11 shrink-0 rounded-2xl bg-card shadow-[var(--shadow-soft)] ring-1 ring-border/50'

/**
 * Secondary-page chrome: back control + title (+ optional trailing action).
 * Primary tabs use AppHeader instead.
 */
export function PageHeader({
  title,
  subtitle,
  backTo,
  backLabel = 'Back',
  trailing,
  size = 'display',
  className,
}: PageHeaderProps) {
  const navigate = useNavigate()

  const hasSubtitle = subtitle != null

  return (
    <header
      className={cn(
        'flex gap-3.5',
        // Align back control to the title line when a subtitle makes the block taller.
        size === 'display' && hasSubtitle ? 'items-start' : 'items-center',
        className,
      )}
    >
      {backTo ? (
        <Button
          variant="ghost"
          size="icon"
          className={cn(backClassName, size === 'display' && hasSubtitle && 'mt-0.5')}
          asChild
        >
          <Link to={backTo} aria-label={backLabel}>
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(backClassName, size === 'display' && hasSubtitle && 'mt-0.5')}
          aria-label={backLabel}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="size-5" />
        </Button>
      )}

      {title != null && (
        <div className="min-w-0 flex-1 py-0.5">
          {size === 'compact' ? (
            <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
          ) : (
            <h1 className="text-[2rem] font-bold tracking-tight leading-tight">{title}</h1>
          )}
          {hasSubtitle && (
            <p
              className={cn(
                'mt-1 text-sm leading-snug text-muted-foreground',
                size === 'compact' && 'truncate',
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}

      {trailing}
    </header>
  )
}
