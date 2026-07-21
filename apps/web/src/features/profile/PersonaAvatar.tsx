import { cn } from '@/lib/utils'

import { resolveAiPersonality, type AiPersonality, type ActiveAiPersonality } from './types'

import analyst from './avatars/analyst.webp'
import angryMom from './avatars/angry_mom.webp'
import balancedCoach from './avatars/balanced_coach.webp'
import drillSergeant from './avatars/drill_sergeant.webp'
import funnyComedian from './avatars/funny_comedian.webp'
import hustler from './avatars/hustler.webp'

/**
 * Portrait avatars for the AI personas: one hand-illustrated face per active
 * personality, cropped to a consistent circular frame. `resolveAiPersonality`
 * maps legacy persona keys onto the closest active face, so every stored value
 * still resolves to a portrait. The persona `accent` shows as a fallback tint
 * behind the image while it loads and defines the circle edge on light surfaces.
 */
const AVATARS: Record<ActiveAiPersonality, string> = {
  balanced_coach: balancedCoach,
  angry_mom: angryMom,
  drill_sergeant: drillSergeant,
  funny_comedian: funnyComedian,
  hustler,
  analyst,
}

export interface PersonaAvatarProps {
  value: AiPersonality
  accent: string
  /** Diameter in px. Defaults to 44 (matches the settings list). */
  size?: number
  className?: string
}

export function PersonaAvatar({ value, accent, size = 44, className }: PersonaAvatarProps) {
  const src = AVATARS[resolveAiPersonality(value)]
  return (
    <span
      className={cn(
        'relative inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-black/5',
        className,
      )}
      style={{ width: size, height: size, background: accent }}
      aria-hidden
    >
      <img
        src={src}
        alt=""
        className="size-full object-cover object-center"
        loading="lazy"
        draggable={false}
      />
    </span>
  )
}
