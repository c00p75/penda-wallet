import { describe, expect, it } from 'vitest'
import { buildOnboardingMemories, parseHouseholdSize, type OnboardingAnswers } from './onboarding'

describe('parseHouseholdSize', () => {
  it('rejects empty, zero, negative, and non-numeric input', () => {
    expect(parseHouseholdSize('')).toBeNull()
    expect(parseHouseholdSize('   ')).toBeNull()
    expect(parseHouseholdSize('0')).toBeNull()
    expect(parseHouseholdSize('-1')).toBeNull()
    expect(parseHouseholdSize('abc')).toBeNull()
  })

  it('parses a valid positive integer', () => {
    expect(parseHouseholdSize('4')).toBe(4)
    expect(parseHouseholdSize(' 12 ')).toBe(12)
  })
})

describe('buildOnboardingMemories', () => {
  const base: OnboardingAnswers = {
    mode: 'individual',
    householdSize: null,
    primaryGoals: [],
    incomeRange: null,
    gender: 'prefer_not_to_say',
  }

  it('produces no memories when everything is left unanswered', () => {
    expect(buildOnboardingMemories(base, 'wallet-1')).toEqual([])
  })

  it('seeds a fact for a single stated primary goal', () => {
    const memories = buildOnboardingMemories({ ...base, primaryGoals: ['pay_off_debt'] }, 'wallet-1')
    expect(memories).toEqual([
      { wallet_id: 'wallet-1', kind: 'fact', content: 'Their main financial goal right now is to pay off debt.', mood: null },
    ])
  })

  it('seeds a single fact listing multiple stated goals', () => {
    const memories = buildOnboardingMemories(
      { ...base, primaryGoals: ['build_emergency_fund', 'pay_off_debt', 'track_spending'] },
      'wallet-1',
    )
    expect(memories).toEqual([
      {
        wallet_id: 'wallet-1',
        kind: 'fact',
        content:
          'Their main financial goals right now are to build an emergency fund, pay off debt, and track their spending more closely.',
        mood: null,
      },
    ])
  })

  it('only seeds household size when mode is not individual', () => {
    expect(buildOnboardingMemories({ ...base, householdSize: 4 }, 'wallet-1')).toEqual([])

    const familyMemories = buildOnboardingMemories({ ...base, mode: 'family', householdSize: 4 }, 'wallet-1')
    expect(familyMemories).toEqual([
      { wallet_id: 'wallet-1', kind: 'fact', content: 'They manage money for a household of 4 people.', mood: null },
    ])

    const businessMemories = buildOnboardingMemories({ ...base, mode: 'business', householdSize: 3 }, 'wallet-1')
    expect(businessMemories[0].content).toBe('They manage money for a team of 3 people.')
  })

  it('skips income range and gender when set to "prefer not to say"', () => {
    expect(buildOnboardingMemories({ ...base, incomeRange: 'prefer_not_to_say' }, 'wallet-1')).toEqual([])
    expect(buildOnboardingMemories({ ...base, gender: 'prefer_not_to_say' }, 'wallet-1')).toEqual([])
  })

  it('seeds a fact for a stated income range', () => {
    const memories = buildOnboardingMemories({ ...base, incomeRange: 'stable' }, 'wallet-1')
    expect(memories).toEqual([
      { wallet_id: 'wallet-1', kind: 'fact', content: 'They describe their financial situation right now as "Stable".', mood: null },
    ])
  })

  it('seeds a tone-only preference for a stated gender', () => {
    const memories = buildOnboardingMemories({ ...base, gender: 'non_binary' }, 'wallet-1')
    expect(memories).toEqual([
      {
        wallet_id: 'wallet-1',
        kind: 'preference',
        content: 'They identify as Non-binary. Use this only to keep tone natural and relatable, never to shape financial advice or logic.',
        mood: null,
      },
    ])
  })

  it('combines multiple answered fields', () => {
    const memories = buildOnboardingMemories(
      { mode: 'family', householdSize: 5, primaryGoals: ['build_emergency_fund'], incomeRange: 'tight', gender: 'woman' },
      'wallet-1',
    )
    expect(memories).toHaveLength(4)
  })

  it('passes through a null wallet id', () => {
    const memories = buildOnboardingMemories({ ...base, primaryGoals: ['track_spending'] }, null)
    expect(memories[0].wallet_id).toBeNull()
  })
})
