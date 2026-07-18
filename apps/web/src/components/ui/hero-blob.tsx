import { cn } from '@/lib/utils'

type HeroBlobTone = 'iris' | 'apricot' | 'sun' | 'mint' | 'rose'

const BLOB_FILL: Record<HeroBlobTone, string> = {
  iris: 'color-mix(in srgb, white 28%, transparent)',
  apricot: 'color-mix(in srgb, white 30%, transparent)',
  sun: 'color-mix(in srgb, white 32%, transparent)',
  mint: 'color-mix(in srgb, white 28%, transparent)',
  rose: 'color-mix(in srgb, white 28%, transparent)',
}

/**
 * Decorative organic blob for HeroCard corners, stands in for the
 * 3D illustrations in the reference design.
 */
export function HeroBlob({
  tone = 'iris',
  className,
}: {
  tone?: HeroBlobTone
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden
      className={cn('pointer-events-none absolute', className)}
    >
      <path
        fill={BLOB_FILL[tone]}
        d="M78 8c22 6 38 28 34 50s-28 38-52 40S8 82 10 56 28 4 56 6c8 1 14 1 22 2z"
      />
      <circle cx="88" cy="78" r="18" fill={BLOB_FILL[tone]} opacity={0.7} />
      <circle cx="42" cy="92" r="10" fill={BLOB_FILL[tone]} opacity={0.55} />
    </svg>
  )
}
