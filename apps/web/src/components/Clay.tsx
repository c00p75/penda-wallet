import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * A "clay 3D" shell: a tinted sphere with a top-left gloss, a bright rim, a
 * bottom inner shadow, and a drop shadow — all pure CSS/SVG, no WebGL. Drop a
 * flat SVG glyph (or a portrait) inside and it reads as a dimensional object.
 * Everything scales from `size`, so the same shell works at 28px (chat header)
 * or 96px (empty-state hero).
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

export type ClayGlyphName =
  | 'wallet'
  | 'piggybank'
  | 'target'
  | 'trophy'
  | 'chart'
  | 'receipt'
  | 'coins'
  | 'flame'
  | 'trendDown'

const GLYPHS: Record<ClayGlyphName, ReactNode> = {
  wallet: (
    <>
      <rect x="13" y="20" width="38" height="26" rx="6" fill="#fff" />
      <path d="M51 27 h-11 a6 6 0 0 0 0 12 h11 Z" fill="rgba(0,0,0,0.18)" />
      <circle cx="42" cy="33" r="2.3" fill="#fff" />
    </>
  ),
  piggybank: (
    <>
      <ellipse cx="31" cy="35" rx="16" ry="12" fill="#fff" />
      <path d="M20 25 l7 3 -3.5 6.5 Z" fill="#fff" />
      <ellipse cx="46" cy="35" rx="4.5" ry="5.2" fill="#fff" />
      <rect x="21" y="45" width="4.2" height="5" rx="1.6" fill="#fff" />
      <rect x="37" y="45" width="4.2" height="5" rx="1.6" fill="#fff" />
      <rect x="27" y="25.5" width="10" height="2.4" rx="1.2" fill="rgba(0,0,0,0.28)" />
      <circle cx="29" cy="32" r="1.5" fill="rgba(0,0,0,0.5)" />
      <circle cx="45.4" cy="33.6" r="0.9" fill="rgba(0,0,0,0.35)" />
      <circle cx="45.4" cy="36.4" r="0.9" fill="rgba(0,0,0,0.35)" />
    </>
  ),
  target: (
    <>
      <circle cx="32" cy="32" r="15" fill="none" stroke="#fff" strokeWidth="4" />
      <circle cx="32" cy="32" r="7.5" fill="none" stroke="#fff" strokeWidth="4" />
      <circle cx="32" cy="32" r="2.4" fill="#fff" />
    </>
  ),
  trophy: (
    <>
      <path d="M22 18 h20 v6 a10 10 0 0 1 -20 0 Z" fill="#fff" />
      <path d="M22 19.5 h-4.5 a4.5 4.5 0 0 0 4.5 6.5" fill="none" stroke="#fff" strokeWidth="2.6" />
      <path d="M42 19.5 h4.5 a4.5 4.5 0 0 1 -4.5 6.5" fill="none" stroke="#fff" strokeWidth="2.6" />
      <rect x="29.6" y="33" width="4.8" height="7" fill="#fff" />
      <rect x="24" y="40" width="16" height="4" rx="2" fill="#fff" />
    </>
  ),
  chart: (
    <>
      <rect x="17" y="33" width="7" height="12" rx="2" fill="#fff" />
      <rect x="28.5" y="25" width="7" height="20" rx="2" fill="#fff" />
      <rect x="40" y="29" width="7" height="16" rx="2" fill="#fff" />
      <rect x="15" y="45.5" width="34" height="2.6" rx="1.3" fill="rgba(255,255,255,0.65)" />
    </>
  ),
  receipt: (
    <>
      <path d="M20 15 h24 v33 l-4 -3 -4 3 -4 -3 -4 3 -4 -3 -4 3 Z" fill="#fff" />
      <g stroke="rgba(0,0,0,0.22)" strokeWidth="2.2" strokeLinecap="round">
        <path d="M25 24 h14" />
        <path d="M25 30 h14" />
        <path d="M25 36 h9" />
      </g>
    </>
  ),
  coins: (
    <>
      <path d="M20 31 v10 a12 4.2 0 0 0 24 0 v-10 Z" fill="#fff" />
      <ellipse cx="32" cy="31" rx="12" ry="4.2" fill="#fff" />
      <path d="M20 36 a12 4.2 0 0 0 24 0" fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth="1.4" />
      <path d="M20 41 a12 4.2 0 0 0 24 0" fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth="1.4" />
      <ellipse cx="32" cy="31" rx="12" ry="4.2" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1.2" />
    </>
  ),
  flame: (
    <>
      <path
        d="M33 15 C 40 24, 45 28, 41 39 C 38.5 46, 25.5 47, 23 39 C 21 33, 25 31, 25 26 C 29 30, 29 24, 33 15 Z"
        fill="#fff"
      />
      <path
        d="M33 30 C 36.5 34, 37 38, 34 42 C 31 45.5, 27 42, 28.5 37.5 C 29.5 34.5, 31.5 34, 33 30 Z"
        fill="rgba(0,0,0,0.12)"
      />
    </>
  ),
  trendDown: (
    <>
      <polyline
        points="16,23 27,33 34,28 45,39"
        fill="none"
        stroke="#fff"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M45 39 l0 -8 M45 39 l-8 0"
        fill="none"
        stroke="#fff"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
}

/** A clay-3D icon: a glyph rendered inside a {@link ClayOrb}. */
export function Clay3DIcon({
  name,
  accent,
  size = 44,
  className,
  dim = false,
}: {
  name: ClayGlyphName
  accent: string
  size?: number
  className?: string
  dim?: boolean
}) {
  return (
    <ClayOrb accent={accent} size={size} className={className} dim={dim}>
      <svg viewBox="0 0 64 64" className="size-full">
        {GLYPHS[name]}
      </svg>
    </ClayOrb>
  )
}
