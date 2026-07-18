import { describe, expect, it } from 'vitest'
import { suggestedPromptsFor } from './suggestedPrompts'

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
})
