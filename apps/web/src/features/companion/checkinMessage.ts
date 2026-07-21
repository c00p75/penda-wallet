import { PERSONA_DISPLAY_NAMES } from '@/features/profile/types'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Stored check-ins / weekly letters bake in the persona name at send time.
 * When the user switches personas, retarget speaker copy to the current name
 * and drop the redundant "A note from X:" title the card already shows.
 */
export function retargetCheckinMessage(message: string, personaName: string): string {
  let text = message.replace(/^A note from\s+[^:]+:\s*/i, '').trim()

  const names = [...new Set([...PERSONA_DISPLAY_NAMES, personaName])]
    .filter((name) => name && name.toLowerCase() !== personaName.toLowerCase())
    .sort((a, b) => b.length - a.length)

  for (const name of names) {
    // Only rewrite the speaker voice ("Zee here", "Mama Rose wrote"), not
    // unrelated mentions of a person who happens to share a persona name.
    const speaker = new RegExp(
      `\\b${escapeRegExp(name)}(?=\\s+(?:here|wrote)\\b)`,
      'gi',
    )
    text = text.replace(speaker, personaName)
  }

  return text || message
}
