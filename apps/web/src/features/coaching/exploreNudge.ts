import type { InsightCard } from './InsightCarousel'
import { EXPLORABLE_PAGES, type ExplorablePage } from './pageRegistry'
import type { AiPersonality } from '@/features/profile/types'

function dayOfYear(iso: string): number {
  const date = new Date(`${iso}T00:00:00Z`)
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  return Math.floor((date.getTime() - start) / 86_400_000)
}

/**
 * One nudge card pointing at a page this wallet hasn't visited yet, or `null`
 * once every explorable page has been visited. Picks are ranked newest-first
 * (pages with a real ship date), then rotate deterministically by day so the
 * same nudge doesn't repeat on every visit without needing extra state.
 */
export function buildExploreNudgeCard(input: {
  visitedPages: Set<string>
  persona: { value: AiPersonality; accent: string; name: string }
  today: string
  onExplore: (route: string) => void
  onWhy: (id: string) => void
  /** Defaults to the real registry; overridable so tests don't depend on it. */
  pages?: ExplorablePage[]
}): InsightCard | null {
  const unvisited = (input.pages ?? EXPLORABLE_PAGES).filter((p) => !input.visitedPages.has(p.page))
  if (unvisited.length === 0) return null

  const ranked = [...unvisited].sort((a, b) => {
    if (a.addedAt && b.addedAt) return b.addedAt.localeCompare(a.addedAt)
    if (a.addedAt) return -1
    if (b.addedAt) return 1
    return 0
  })
  const pick = ranked[dayOfYear(input.today) % ranked.length]
  const id = `explore:${pick.page}`

  return {
    id,
    variant: 'tip',
    tone: 'default',
    label: `${input.persona.name}:`,
    text: `Haven’t tried ${pick.label} yet? ${pick.blurb}`,
    persona: { value: input.persona.value, accent: input.persona.accent },
    action: { label: 'Take me there', onTap: () => input.onExplore(pick.route) },
    onWhy: () => input.onWhy(id),
  }
}
