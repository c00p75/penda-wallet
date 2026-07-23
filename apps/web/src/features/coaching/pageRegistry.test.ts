import { describe, expect, it } from 'vitest'
import { CHAT_PAGES } from '@/features/chat/pageContext'
import { EXPLORABLE_PAGES } from './pageRegistry'

/**
 * Pages deliberately not worth nudging users toward. Kept here (rather than
 * imported) so this test fails loudly - instead of silently passing - when a
 * new CHAT_PAGES entry is added without a decision on whether it belongs in
 * EXPLORABLE_PAGES.
 */
const UTILITY_PAGES = new Set(['home', 'settings', 'profile', 'notifications', 'ai-actions', 'goal-detail'])

describe('EXPLORABLE_PAGES', () => {
  it('covers every non-utility CHAT_PAGES entry exactly once', () => {
    const expected = CHAT_PAGES.filter((page) => !UTILITY_PAGES.has(page)).toSorted()
    const actual = EXPLORABLE_PAGES.map((p) => p.page).toSorted()
    expect(actual).toEqual(expected)
  })

  it('gives every entry a label, blurb, and an in-app route', () => {
    for (const entry of EXPLORABLE_PAGES) {
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.blurb.length).toBeGreaterThan(0)
      expect(entry.route.startsWith('/')).toBe(true)
    }
  })
})
