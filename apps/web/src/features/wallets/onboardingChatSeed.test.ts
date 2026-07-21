import { describe, expect, it } from 'vitest'
import { buildPlanChatSeed } from './onboardingChatSeed'

describe('buildPlanChatSeed', () => {
  it('uses a generic draft when budgets are not ready yet', () => {
    expect(buildPlanChatSeed([], 'USD')).toMatch(/Plan tab/)
  })

  it('lists budget labels and amounts when seeded', () => {
    const seed = buildPlanChatSeed(
      [
        { label: 'Food', amount: 20_000 },
        { label: 'Transport', amount: 10_000 },
      ],
      'USD',
    )
    expect(seed).toContain('Food')
    expect(seed).toContain('Transport')
    expect(seed).toMatch(/looks good/)
  })
})
