import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type IconTileTone = 'iris' | 'apricot' | 'sun' | 'mint' | 'rose' | 'muted'

const TONE_STYLES: Record<IconTileTone, { bg: string; fg: string }> = {
  iris: { bg: 'var(--iris-soft)', fg: 'var(--iris)' },
  apricot: { bg: 'var(--apricot-soft)', fg: 'var(--apricot)' },
  sun: { bg: 'var(--sun-soft)', fg: 'var(--sun)' },
  mint: { bg: 'var(--mint-soft)', fg: 'var(--mint)' },
  rose: { bg: 'var(--rose-soft)', fg: 'var(--rose)' },
  muted: { bg: 'var(--muted)', fg: 'var(--muted-foreground)' },
}

type IconTileProps = {
  icon?: ElementType
  emoji?: string
  label: string
  tone?: IconTileTone
  progress?: number
  progressColor?: string
  onClick?: () => void
  className?: string
  children?: ReactNode
}

/**
 * Tinted icon + label tile for quick-action / category grids.
 */
export function IconTile({
  icon: Icon,
  emoji,
  label,
  tone = 'iris',
  progress,
  progressColor,
  onClick,
  className,
  children,
}: IconTileProps) {
  const colors = TONE_STYLES[tone]
  const Comp = onClick ? 'button' : 'div'

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-2.5 rounded-2xl border border-border/60 bg-card p-3.5 text-left shadow-[var(--shadow-soft)]',
        onClick && 'transition-transform active:scale-[0.97]',
        className,
      )}
    >
      <span
        className="grid size-10 place-items-center rounded-2xl text-base"
        style={{ background: colors.bg, color: colors.fg }}
      >
        {emoji ?? (Icon ? <Icon className="size-5" /> : null)}
      </span>
      <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">{label}</p>
      {progress != null && (
        <div className="mt-auto h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${Math.max(0, Math.min(100, progress))}%`,
              background: progressColor ?? colors.fg,
            }}
          />
        </div>
      )}
      {children}
    </Comp>
  )
}
