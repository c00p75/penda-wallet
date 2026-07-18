import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { HeroBlob } from '@/components/ui/hero-blob'

export type HeroTone = 'iris' | 'apricot' | 'sun' | 'mint' | 'rose'

const HERO_BG: Record<HeroTone, string> = {
  iris: 'linear-gradient(145deg, var(--iris-hero-from) 0%, var(--iris-hero-to) 100%)',
  apricot: 'linear-gradient(145deg, var(--apricot-hero-from) 0%, var(--apricot-hero-to) 100%)',
  sun: 'linear-gradient(145deg, var(--sun-hero-from) 0%, var(--sun-hero-to) 100%)',
  mint: 'linear-gradient(145deg, var(--mint-hero-from) 0%, var(--mint-hero-to) 100%)',
  rose: 'linear-gradient(145deg, var(--rose-hero-from) 0%, var(--rose-hero-to) 100%)',
}

const HERO_SHADOW: Record<HeroTone, string> = {
  iris: '0 14px 36px color-mix(in srgb, var(--iris-hero-to) 45%, transparent)',
  apricot: '0 14px 36px color-mix(in srgb, var(--apricot-hero-to) 45%, transparent)',
  sun: '0 14px 36px color-mix(in srgb, var(--sun-hero-to) 45%, transparent)',
  mint: '0 14px 36px color-mix(in srgb, var(--mint-hero-to) 45%, transparent)',
  rose: '0 14px 36px color-mix(in srgb, var(--rose-hero-to) 45%, transparent)',
}

type HeroCardProps = {
  tone?: HeroTone
  label?: ReactNode
  value?: ReactNode
  children?: ReactNode
  blob?: boolean
  className?: string
  onClick?: () => void
}

/**
 * Colorful full-bleed illustrated card used for key stats
 * (balance, safe-to-spend, goals, etc.).
 */
export function HeroCard({
  tone = 'iris',
  label,
  value,
  children,
  blob = true,
  className,
  onClick,
}: HeroCardProps) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'relative isolate min-h-[9.5rem] w-[11.5rem] shrink-0 overflow-hidden rounded-[1.75rem] p-5 text-left text-white',
        onClick && 'transition-transform active:scale-[0.98]',
        className,
      )}
      style={{
        background: HERO_BG[tone],
        boxShadow: HERO_SHADOW[tone],
      }}
    >
      {blob && <HeroBlob tone={tone} className="-right-4 -bottom-6 size-28 rotate-12" />}
      <div className="relative z-10 flex h-full flex-col justify-between gap-3">
        {label != null && (
          <p className="text-sm font-medium text-white/85">{label}</p>
        )}
        {value != null && (
          <p className="text-3xl font-bold leading-none tracking-tight tabular-nums">{value}</p>
        )}
        {children}
      </div>
    </Comp>
  )
}
