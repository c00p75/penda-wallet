import { cn } from '@/lib/utils'

type HeroBlobTone = 'iris' | 'apricot' | 'sun' | 'mint' | 'rose'

/**
 * Decorative organic blob for HeroCard corners, stands in for the
 * 3D illustrations in the reference design.
 * Fill strength follows --hero-blob-white (theme token for light/dark).
 */
export function HeroBlob({
  tone = 'iris',
  className,
}: {
  tone?: HeroBlobTone
  className?: string
}) {
  const fill = 'color-mix(in srgb, white var(--hero-blob-white), transparent)'
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden
      data-tone={tone}
      className={cn('pointer-events-none absolute', className)}
    >
      <path
        fill={fill}
        d="M78 8c22 6 38 28 34 50s-28 38-52 40S8 82 10 56 28 4 56 6c8 1 14 1 22 2z"
      />
      <circle cx="88" cy="78" r="18" fill={fill} opacity={0.7} />
      <circle cx="42" cy="92" r="10" fill={fill} opacity={0.55} />
    </svg>
  )
}
