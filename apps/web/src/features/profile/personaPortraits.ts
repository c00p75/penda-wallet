import { resolveAiPersonality, type ActiveAiPersonality, type AiPersonality } from './types'

import analyst from './portraits/analyst.png'
import angryMom from './portraits/angry_mom.png'
import balancedCoach from './portraits/balanced_coach.png'
import drillSergeant from './portraits/drill_sergeant.png'
import funnyComedian from './portraits/funny_comedian.png'
import hustler from './portraits/hustler.png'

/** Full-body / portrait art for chat intro bubbles (not the circular header crops). */
const PORTRAITS: Record<ActiveAiPersonality, string> = {
  balanced_coach: balancedCoach,
  angry_mom: angryMom,
  drill_sergeant: drillSergeant,
  funny_comedian: funnyComedian,
  hustler,
  analyst,
}

export function personaPortraitSrc(value: AiPersonality | string | null | undefined): string {
  return PORTRAITS[resolveAiPersonality(value)]
}
