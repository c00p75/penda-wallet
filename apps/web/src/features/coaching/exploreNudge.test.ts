import { describe, expect, it, vi } from 'vitest'
import { buildExploreNudgeCard } from './exploreNudge'
import type { ExplorablePage } from './pageRegistry'

const persona = { value: 'funny_comedian' as const, accent: 'var(--apricot)', name: 'Bobo' }

const PAGES: ExplorablePage[] = [
  { page: 'missions', label: 'Missions', blurb: 'Short-term money missions.', route: '/missions' },
  { page: 'radar', label: 'Money Radar', blurb: 'Spot bills before they hit.', route: '/radar' },
]

describe('buildExploreNudgeCard', () => {
  it('returns null once every explorable page has been visited', () => {
    const card = buildExploreNudgeCard({
      visitedPages: new Set(PAGES.map((p) => p.page)),
      persona,
      today: '2026-07-22',
      onExplore: vi.fn(),
      onWhy: vi.fn(),
      pages: PAGES,
    })
    expect(card).toBeNull()
  })

  it('returns a card pointing at an unvisited page', () => {
    const card = buildExploreNudgeCard({
      visitedPages: new Set(['missions']),
      persona,
      today: '2026-07-22',
      onExplore: vi.fn(),
      onWhy: vi.fn(),
      pages: PAGES,
    })
    expect(card).not.toBeNull()
    expect(card!.id).toBe('explore:radar')
    expect(card!.text).toContain('Money Radar')
    expect(card!.label).toBe('Bobo:')
  })

  it('is deterministic for the same inputs', () => {
    const build = () =>
      buildExploreNudgeCard({
        visitedPages: new Set(),
        persona,
        today: '2026-07-22',
        onExplore: vi.fn(),
        onWhy: vi.fn(),
        pages: PAGES,
      })
    expect(build()!.id).toBe(build()!.id)
  })

  it('ranks pages with a real ship date ahead of pages without one', () => {
    const pages: ExplorablePage[] = [
      ...PAGES,
      { page: 'family', label: 'Family Hub', blurb: 'Share goals.', route: '/family', addedAt: '2026-07-01' },
    ]
    // Jan 1 is day-of-year 0, so `0 % 3 === 0` lands on the top-ranked pick.
    const card = buildExploreNudgeCard({
      visitedPages: new Set(),
      persona,
      today: '2026-01-01',
      onExplore: vi.fn(),
      onWhy: vi.fn(),
      pages,
    })
    expect(card!.id).toBe('explore:family')
  })

  it('routes the "Take me there" action and the "Why this?" tap through the given callbacks', () => {
    const onExplore = vi.fn()
    const onWhy = vi.fn()
    const card = buildExploreNudgeCard({
      visitedPages: new Set(['missions']),
      persona,
      today: '2026-07-22',
      onExplore,
      onWhy,
      pages: PAGES,
    })
    card!.action!.onTap()
    expect(onExplore).toHaveBeenCalledWith('/radar')
    card!.onWhy!()
    expect(onWhy).toHaveBeenCalledWith('explore:radar')
  })
})
