import { cn } from '@/lib/utils'

import { resolveAiPersonality, type AiPersonality } from './types'

/**
 * A cast of hand-drawn portrait avatars for the AI personas, one flat-vector
 * face per personality, built from a shared kit of features (skin, hair, brows,
 * eyes, mouth, accessories) so they read as one family. The tinted circle
 * behind each face reuses the persona's `accent`, matching the rest of the profile UI.
 * Legacy persona keys still have faces; `resolveAiPersonality` maps them for the UI.
 */

type HairStyle =
  | 'short'
  | 'fade'
  | 'bob'
  | 'bun'
  | 'curls'
  | 'wrap'
  | 'cap'

type EyeStyle = 'open' | 'smile'
type BrowStyle = 'calm' | 'angry' | 'raised'
type MouthStyle =
  | 'smile'
  | 'smallSmile'
  | 'grin'
  | 'laugh'
  | 'flat'
  | 'frown'
  | 'smirk'
  | 'confident'

interface FaceConfig {
  skin: string
  clothes: string
  hair: { style: HairStyle; color: string; knot?: string }
  eyes: EyeStyle
  brows: BrowStyle
  mouth: MouthStyle
  glasses?: 'dark' | 'gold'
  shades?: boolean
  earrings?: boolean
  beard?: string
  wrinkles?: boolean
}

const INK = '#2c2420'
const BROW = '#3a2f28'
const LIP = '#7d3b32'
const MOUTH_FILL = '#6f2f2a'
const SHADOW = 'rgba(0,0,0,0.16)'
const GOLD = '#f4c95d'

const FACES: Record<AiPersonality, FaceConfig> = {
  balanced_coach: {
    skin: '#b1763f',
    clothes: '#5b6ee6',
    hair: { style: 'bob', color: '#241a17' },
    eyes: 'smile',
    brows: 'calm',
    mouth: 'smile',
    earrings: true,
  },
  angry_mom: {
    skin: '#a9713e',
    clothes: '#7d3b6b',
    hair: { style: 'wrap', color: '#c94f86', knot: '#b8407a' },
    eyes: 'open',
    brows: 'angry',
    mouth: 'frown',
    earrings: true,
  },
  wise_mentor: {
    skin: '#9a6836',
    clothes: '#3f9a86',
    hair: { style: 'short', color: '#9c9691' },
    eyes: 'open',
    brows: 'calm',
    mouth: 'smallSmile',
    glasses: 'dark',
    beard: '#9c9691',
  },
  chill_friend: {
    skin: '#b1763f',
    clothes: '#e0955a',
    hair: { style: 'fade', color: '#241a17' },
    eyes: 'smile',
    brows: 'calm',
    mouth: 'grin',
  },
  drill_sergeant: {
    skin: '#8a5a2b',
    clothes: '#2f4a6e',
    hair: { style: 'cap', color: '#2a3a57' },
    eyes: 'open',
    brows: 'angry',
    mouth: 'flat',
  },
  funny_comedian: {
    skin: '#b1763f',
    clothes: '#e0a020',
    hair: { style: 'curls', color: '#241a17' },
    eyes: 'smile',
    brows: 'raised',
    mouth: 'laugh',
  },
  gen_z: {
    skin: '#b1763f',
    clothes: '#e64fa0',
    hair: { style: 'bun', color: '#241a17', knot: '#ff6bd6' },
    eyes: 'open',
    brows: 'raised',
    mouth: 'smirk',
    shades: true,
    earrings: true,
  },
  hustler: {
    skin: '#9a6836',
    clothes: '#1f9a5a',
    hair: { style: 'short', color: '#241a17' },
    eyes: 'open',
    brows: 'calm',
    mouth: 'confident',
    shades: true,
  },
  gogo: {
    skin: '#9a6836',
    clothes: '#c07a3a',
    hair: { style: 'bun', color: '#cdc8c1', knot: '#cdc8c1' },
    eyes: 'smile',
    brows: 'calm',
    mouth: 'smile',
    glasses: 'gold',
    wrinkles: true,
    earrings: true,
  },
  analyst: {
    skin: '#9a6836',
    clothes: '#4a5568',
    hair: { style: 'bun', color: '#241a17', knot: '#241a17' },
    eyes: 'open',
    brows: 'calm',
    mouth: 'flat',
    glasses: 'dark',
  },
}

function Brows({ style }: { style: BrowStyle }) {
  const stroke = { stroke: BROW, strokeWidth: 1.6, strokeLinecap: 'round' as const, fill: 'none' }
  if (style === 'angry') {
    return (
      <>
        <path d="M23.4 23.6 L29.3 25.9" {...stroke} />
        <path d="M40.6 23.6 L34.7 25.9" {...stroke} />
      </>
    )
  }
  if (style === 'raised') {
    return (
      <>
        <path d="M23.4 24 Q26.5 21.9 29.6 24" {...stroke} />
        <path d="M40.6 24 Q37.5 21.9 34.4 24" {...stroke} />
      </>
    )
  }
  return (
    <>
      <path d="M23.4 25 Q26.5 23.5 29.3 24.6" {...stroke} />
      <path d="M40.6 25 Q37.5 23.5 34.7 24.6" {...stroke} />
    </>
  )
}

function Eyes({ style }: { style: EyeStyle }) {
  if (style === 'smile') {
    const stroke = { stroke: INK, strokeWidth: 1.6, strokeLinecap: 'round' as const, fill: 'none' }
    return (
      <>
        <path d="M24.3 30 Q26.5 32.4 28.7 30" {...stroke} />
        <path d="M35.3 30 Q37.5 32.4 39.7 30" {...stroke} />
      </>
    )
  }
  return (
    <>
      <ellipse cx="26.5" cy="29.8" rx="1.6" ry="2.1" fill={INK} />
      <ellipse cx="37.5" cy="29.8" rx="1.6" ry="2.1" fill={INK} />
      <circle cx="27.1" cy="29.1" r="0.5" fill="#fff" />
      <circle cx="38.1" cy="29.1" r="0.5" fill="#fff" />
    </>
  )
}

function Mouth({ style }: { style: MouthStyle }) {
  const line = { stroke: LIP, strokeWidth: 1.8, strokeLinecap: 'round' as const, fill: 'none' }
  switch (style) {
    case 'smallSmile':
      return <path d="M29 38.6 Q32 40.8 35 38.6" {...line} />
    case 'flat':
      return <path d="M28 38.8 L36 38.8" {...line} />
    case 'frown':
      return <path d="M28.5 39.6 Q32 37.6 35.5 39.6" {...line} />
    case 'smirk':
      return <path d="M28 39 Q32 40.6 37 37.1" {...line} />
    case 'confident':
      return <path d="M28 38.4 Q31 40.2 37 37.4" {...line} />
    case 'grin':
      return (
        <>
          <path d="M27 37.4 Q32 43 37 37.4 Z" fill={MOUTH_FILL} />
          <path d="M28.6 38 Q32 40 35.4 38 Z" fill="#fff" />
        </>
      )
    case 'laugh':
      return (
        <>
          <path d="M26.5 37 Q32 45 37.5 37 Q32 39.4 26.5 37 Z" fill={MOUTH_FILL} />
          <path d="M27.6 37.4 Q32 39 36.4 37.4 Z" fill="#fff" />
          <ellipse cx="32" cy="42" rx="2.8" ry="1.5" fill="#d76b6b" />
        </>
      )
    default:
      return <path d="M27 38 Q32 42.5 37 38" {...line} />
  }
}

function HairBack({ hair }: { hair: FaceConfig['hair'] }) {
  if (hair.style === 'bun') {
    return <circle cx="32" cy="13.6" r="5" fill={hair.knot ?? hair.color} />
  }
  if (hair.style === 'curls') {
    return (
      <g fill={hair.color}>
        <circle cx="20" cy="23" r="5.2" />
        <circle cx="26" cy="16.5" r="5.2" />
        <circle cx="32" cy="14.5" r="5.4" />
        <circle cx="38" cy="16.5" r="5.2" />
        <circle cx="44" cy="23" r="5.2" />
        <circle cx="17.5" cy="30" r="4.6" />
        <circle cx="46.5" cy="30" r="4.6" />
      </g>
    )
  }
  return null
}

function HairFront({ hair }: { hair: FaceConfig['hair'] }) {
  switch (hair.style) {
    case 'bob':
      return (
        <path
          d="M16.5 31 Q15.5 14 32 14 Q48.5 14 47.5 31 L47 40 Q46 30 43.5 25.5 Q39 20.5 32 20.5 Q25 20.5 20.5 25.5 Q18 30 17 40 Z"
          fill={hair.color}
        />
      )
    case 'fade':
      return (
        <path
          d="M20 27 Q20 16.5 32 16.5 Q44 16.5 44 27 Q42 21.4 32 21.4 Q22 21.4 20 27 Z"
          fill={hair.color}
        />
      )
    case 'bun':
      return (
        <path
          d="M18.5 29 Q17.5 15.5 32 15.5 Q46.5 15.5 45.5 29 Q45 22 40 20.4 Q36 23.6 32 23 Q28 23.6 24 20.4 Q19 22 18.5 29 Z"
          fill={hair.color}
        />
      )
    case 'curls':
      return (
        <g fill={hair.color}>
          <circle cx="24" cy="19.5" r="3.6" />
          <circle cx="32" cy="17.6" r="3.8" />
          <circle cx="40" cy="19.5" r="3.6" />
        </g>
      )
    case 'wrap':
      return (
        <>
          <path
            d="M17 29 Q16 12 32 12 Q48 12 47 29 Q47 19 39 16 Q32 13 25 16 Q17 19 17 29 Z"
            fill={hair.color}
          />
          <ellipse cx="42.5" cy="15.5" rx="3.6" ry="2.6" fill={hair.knot ?? hair.color} />
          <path d="M19.5 20 Q32 14.5 44.5 20" stroke={SHADOW} strokeWidth="1" fill="none" />
        </>
      )
    case 'cap':
      return (
        <>
          <path d="M20 25.6 Q20 16 32 16 Q44 16 44 25.6 Z" fill={hair.color} />
          <rect x="16.5" y="25.2" width="31" height="2.8" rx="1.4" fill="#1e2a3f" />
          <circle cx="32" cy="20.4" r="1.9" fill="#c9a227" />
        </>
      )
    case 'short':
    default:
      return (
        <path
          d="M18.5 30 Q17 15 32 15 Q47 15 45.5 30 Q45.5 22 40 20.5 Q36 24 32 23.2 Q28 24 24 20.5 Q18.5 22 18.5 30 Z"
          fill={hair.color}
        />
      )
  }
}

function Glasses({ tint }: { tint: 'dark' | 'gold' }) {
  const stroke = tint === 'gold' ? '#c99a2e' : '#2f2a26'
  return (
    <g fill="none" stroke={stroke} strokeWidth="1.4">
      <circle cx="26.5" cy="30" r="4" />
      <circle cx="37.5" cy="30" r="4" />
      <path d="M30.5 29.6 H33.5" />
      <path d="M22.5 29.2 L19.8 30" />
      <path d="M41.5 29.2 L44.2 30" />
    </g>
  )
}

function Shades() {
  return (
    <g>
      <rect x="22" y="27" width="8.6" height="5.3" rx="2.3" fill="#1b1b1b" />
      <rect x="33.4" y="27" width="8.6" height="5.3" rx="2.3" fill="#1b1b1b" />
      <path d="M30.6 28.6 H33.4" stroke="#1b1b1b" strokeWidth="1.3" />
      <path d="M23.6 28.8 L26.2 28.8" stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeLinecap="round" />
      <path d="M35 28.8 L37.6 28.8" stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeLinecap="round" />
    </g>
  )
}

export interface PersonaAvatarProps {
  value: AiPersonality
  accent: string
  /** Diameter in px. Defaults to 44 (matches the settings list). */
  size?: number
  className?: string
}

export function PersonaAvatar({ value, accent, size = 44, className }: PersonaAvatarProps) {
  const f = FACES[resolveAiPersonality(value)] ?? FACES[value] ?? FACES.balanced_coach
  return (
    <span
      className={cn('relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full', className)}
      style={{ width: size, height: size, background: accent }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" className="size-full">
        {/* hair behind the head (buns, afro halo) */}
        <HairBack hair={f.hair} />

        {/* neck + shoulders */}
        <rect x="28" y="39" width="8" height="10" rx="3.5" fill={f.skin} />
        <path d="M8 64 Q9 50 21 47 L43 47 Q55 50 56 64 Z" fill={f.clothes} />
        <path d="M25 47 Q32 53 39 47" fill={SHADOW} />

        {/* ears + earrings */}
        <ellipse cx="19.5" cy="30.5" rx="2.5" ry="3.2" fill={f.skin} />
        <ellipse cx="44.5" cy="30.5" rx="2.5" ry="3.2" fill={f.skin} />
        {f.earrings && (
          <>
            <circle cx="19.5" cy="35" r="1.6" fill={GOLD} />
            <circle cx="44.5" cy="35" r="1.6" fill={GOLD} />
          </>
        )}

        {/* face */}
        <ellipse cx="32" cy="29.5" rx="13" ry="14" fill={f.skin} />
        {f.beard && (
          <path
            d="M21 33 Q21 45 32 46 Q43 45 43 33 Q43 41 32 41 Q21 41 21 33 Z"
            fill={f.beard}
            opacity="0.85"
          />
        )}

        <Brows style={f.brows} />
        {!f.shades && <Eyes style={f.eyes} />}

        {/* nose */}
        <path
          d="M32 30.5 L30.8 34 Q32 35 33.2 34"
          fill="none"
          stroke={SHADOW}
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <Mouth style={f.mouth} />

        {f.wrinkles && (
          <g stroke="rgba(0,0,0,0.12)" strokeWidth="0.9" fill="none" strokeLinecap="round">
            <path d="M23 27.4 Q24.5 28 26 27.4" />
            <path d="M38 27.4 Q39.5 28 41 27.4" />
          </g>
        )}

        {/* hair over the forehead/crown, drawn last so it frames the face */}
        <HairFront hair={f.hair} />

        {f.glasses && <Glasses tint={f.glasses} />}
        {f.shades && <Shades />}
      </svg>
    </span>
  )
}
