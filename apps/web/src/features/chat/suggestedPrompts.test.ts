import { describe, expect, it } from 'vitest'
import { suggestedPromptsFor } from './suggestedPrompts'
import type { PageContext } from './pageContext'

describe('suggestedPromptsFor', () => {
  it('returns budget-aware prompts on the budgets page', () => {
    const prompts = suggestedPromptsFor({ page: 'budgets' }, 'USD')
    expect(prompts[0]?.label).toMatch(/budget/i)
    expect(prompts.every((p) => p.autoSend)).toBe(true)
  })

  it('offers a spend seed on home without auto-sending', () => {
    const prompts = suggestedPromptsFor({ page: 'home' }, 'KES')
    const spend = prompts.find((p) => p.label.startsWith('I spent'))
    expect(spend?.autoSend).toBe(false)
  })

  it('offers setup prompts on first run instead of data-dependent ones', () => {
    const prompts = suggestedPromptsFor({ page: 'home' }, 'ZMW', { isFirstRun: true })
    expect(prompts.some((p) => p.label.startsWith('I spent'))).toBe(true)
    expect(prompts.some((p) => p.label.startsWith('My balance is'))).toBe(true)
    expect(prompts.some((p) => /spent this week/i.test(p.label))).toBe(false)
    expect(prompts.some((p) => /simple budget/i.test(p.label))).toBe(true)
  })

  it('first-run prompts ignore page context', () => {
    const onBudgets = suggestedPromptsFor({ page: 'budgets' }, 'ZMW', { isFirstRun: true })
    expect(onBudgets.some((p) => /My balance is/.test(p.label))).toBe(true)
    expect(onBudgets.some((p) => /How are my budgets/.test(p.label))).toBe(false)
  })

  it.each([
    ['budgets', /budget/i],
    ['goals', /goal/i],
    ['goal-detail', /goal/i],
    ['cashflow', /payday|run short|cut spending/i],
    ['analytics', /spend|ghost|money going/i],
    ['ledger', /spent|categorize|uber/i],
    ['journal', /remember|money story/i],
    ['simulator', /rent|afford/i],
    ['business', /side hustle|tax/i],
    ['family', /household|settle/i],
    ['home', /spent|budget|uber/i],
  ] as const)('page %s returns relevant prompts', (page, pattern) => {
    const prompts = suggestedPromptsFor({ page } as PageContext, 'ZMW')
    expect(prompts.length).toBeGreaterThan(0)
    expect(prompts.some((p) => pattern.test(p.label))).toBe(true)
  })

  it('uses currency symbol in spend seeds', () => {
    expect(suggestedPromptsFor({ page: 'ledger' }, 'ZMW').some((p) => p.label.includes('K'))).toBe(true)
    expect(suggestedPromptsFor({ page: 'home' }, 'USD').some((p) => p.label.includes('$'))).toBe(true)
  })

  it('ledger teach prompt auto-sends', () => {
    const teach = suggestedPromptsFor({ page: 'ledger' }, 'USD').find((p) => /uber/i.test(p.label))
    expect(teach?.autoSend).toBe(true)
  })

  it('unknown page falls back to home prompts', () => {
    const prompts = suggestedPromptsFor({ page: 'settings' as PageContext['page'] }, 'USD')
    expect(prompts.some((p) => p.label.startsWith('I spent'))).toBe(true)
  })

  it('never returns empty labels', () => {
    const pages = [
      'budgets',
      'goals',
      'cashflow',
      'analytics',
      'ledger',
      'journal',
      'simulator',
      'business',
      'family',
      'home',
    ] as const
    for (const page of pages) {
      for (const p of suggestedPromptsFor({ page }, 'ZMW')) {
        expect(p.label.trim().length).toBeGreaterThan(0)
      }
    }
  })
})
