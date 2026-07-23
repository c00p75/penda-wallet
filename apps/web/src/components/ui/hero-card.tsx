import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type HeroTone = 'iris' | 'apricot' | 'sun' | 'mint' | 'rose'

const HERO_BG: Record<HeroTone, string> = {
  iris: 'linear-gradient(145deg, var(--iris-hero-from) 0%, var(--iris-hero-to) 100%)',
  apricot: 'linear-gradient(145deg, var(--apricot-hero-from) 0%, var(--apricot-hero-to) 100%)',
  sun: 'linear-gradient(145deg, var(--sun-hero-from) 0%, var(--sun-hero-to) 100%)',
  mint: 'linear-gradient(145deg, var(--mint-hero-from) 0%, var(--mint-hero-to) 100%)',
  rose: 'linear-gradient(145deg, var(--rose-hero-from) 0%, var(--rose-hero-to) 100%)',
}

const HERO_GLOW: Record<HeroTone, string> = {
  iris: 'var(--iris-hero-glow)',
  apricot: 'var(--apricot-hero-glow)',
  sun: 'var(--sun-hero-glow)',
  mint: 'var(--mint-hero-glow)',
  rose: 'var(--rose-hero-glow)',
}

type HeroCardProps = {
  tone?: HeroTone
  label?: ReactNode
  value?: ReactNode
  children?: ReactNode
  className?: string
  onClick?: () => void
  /** Rendered in the label row, just left of the chevron (e.g. an eye-icon toggle). */
  corner?: ReactNode
}

/**
 * Colorful full-bleed card used for key stats
 * (balance, safe-to-spend, goals, etc.). Gradient only, no corner blobs.
 *
 * Renders a div with button semantics (not a literal <button>) so `corner`
 * can safely hold a real interactive control, like an eye-icon toggle,
 * without invalid nested-button markup.
 */
export function HeroCard({
  tone = 'iris',
  label,
  value,
  children,
  className,
  onClick,
  corner,
}: HeroCardProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={cn(
        'relative isolate min-h-[9.5rem] w-[13rem] shrink-0 overflow-hidden rounded-[1.75rem] p-5 text-left text-white',
        onClick && 'cursor-pointer transition-transform active:scale-[0.98]',
        className,
      )}
      style={{
        background: HERO_BG[tone],
        boxShadow: HERO_GLOW[tone],
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'var(--hero-card-scrim)' }}
      />
      <div className="relative z-10 flex h-full min-w-0 flex-col justify-between gap-3">
        {label != null && (
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.28)]">
              {label}
            </p>
            {(corner || onClick) && (
              <div className="flex shrink-0 items-center gap-1.5">
                {corner}
                {onClick && <ChevronRight className="size-4 shrink-0 text-white/85" aria-hidden />}
              </div>
            )}
          </div>
        )}
        {value != null && (
          <p className="whitespace-nowrap text-3xl font-bold leading-none tracking-tight text-white tabular-nums [text-shadow:0_1px_3px_rgb(0_0_0_/_0.32)]">
            {value}
          </p>
        )}
        {children}
      </div>
    </div>
  )
}
