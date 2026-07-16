import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * A "clay 3D" shell: a tinted sphere with a top-left gloss, a bright rim, a
 * bottom inner shadow, and a drop shadow — all pure CSS/SVG, no WebGL. Drop a
 * flat SVG portrait inside and it reads as a dimensional object. Everything
 * scales from `size`, so the same shell works at 28px (chat header) or 96px.
 *
 * Used by the persona avatars (PersonaAvatar).
 */
export function ClayOrb({
  accent,
  size,
  children,
  className,
  style,
  dim = false,
}: {
  accent: string
  /** Diameter in px — all lighting/shadow values scale from this. */
  size: number
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Softer shadow + gentler gloss, for a recessed / inactive look. */
  dim?: boolean
}) {
  const s = size / 96
  const dropAlpha = dim ? 0.28 : 0.45
  return (
    <span
      className={cn('relative inline-grid shrink-0 place-items-center rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 32% 26%, color-mix(in srgb, ${accent} 78%, #fff), ${accent} 46%, color-mix(in srgb, ${accent} 62%, #000) 100%)`,
        boxShadow: `0 ${10 * s}px ${22 * s}px ${-6 * s}px rgba(0,0,0,${dropAlpha}), 0 ${3 * s}px ${6 * s}px rgba(0,0,0,${dropAlpha * 0.7})`,
        ...style,
      }}
      aria-hidden
    >
      <span className="absolute inset-0 overflow-hidden rounded-full">{children}</span>
      {/* top-left gloss */}
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(58% 42% at 34% 22%, rgba(255,255,255,${dim ? 0.32 : 0.5}), rgba(255,255,255,0) 72%)`,
        }}
      />
      {/* rim light + bottom inner shadow */}
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          boxShadow: `inset 0 ${Math.max(1, 2 * s)}px ${Math.max(1, 3 * s)}px rgba(255,255,255,0.4), inset 0 ${-12 * s}px ${18 * s}px ${-8 * s}px rgba(0,0,0,0.5), inset 0 ${-3 * s}px ${5 * s}px rgba(0,0,0,0.3)`,
        }}
      />
    </span>
  )
}
