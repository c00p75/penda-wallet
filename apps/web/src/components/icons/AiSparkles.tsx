import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/**
 * Four-pointed concave sparkle: sharp N/E/S/W tips with sides pulled inward.
 * Matches the Ask Penda mark from the design reference (not a lucide/phosphor glyph).
 */
function SparklePath({
  cx,
  cy,
  r,
  className,
  style,
}: {
  cx: number
  cy: number
  r: number
  className?: string
  style?: CSSProperties
}) {
  // Control points sit close to center so each side bows inward.
  const k = r * 0.14
  return (
    <path
      className={className}
      style={style}
      d={[
        `M ${cx} ${cy - r}`,
        `Q ${cx + k} ${cy - k} ${cx + r} ${cy}`,
        `Q ${cx + k} ${cy + k} ${cx} ${cy + r}`,
        `Q ${cx - k} ${cy + k} ${cx - r} ${cy}`,
        `Q ${cx - k} ${cy - k} ${cx} ${cy - r}`,
        'Z',
      ].join(' ')}
    />
  )
}

export function AiSparkles({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      <SparklePath
        cx={15.4}
        cy={12}
        r={8.4}
        className="penda-ai-sparkle"
        style={{ ['--twinkle-dur' as string]: '3s', ['--twinkle-delay' as string]: '0s' }}
      />
      <SparklePath
        cx={5.4}
        cy={5.8}
        r={3.7}
        className="penda-ai-sparkle"
        style={{ ['--twinkle-dur' as string]: '2.5s', ['--twinkle-delay' as string]: '0.55s' }}
      />
      <SparklePath
        cx={5}
        cy={17.8}
        r={3.2}
        className="penda-ai-sparkle"
        style={{ ['--twinkle-dur' as string]: '2.8s', ['--twinkle-delay' as string]: '1.1s' }}
      />
    </svg>
  )
}
