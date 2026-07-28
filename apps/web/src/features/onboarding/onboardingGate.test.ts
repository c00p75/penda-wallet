import { describe, expect, it } from 'vitest'
import { shouldShowCreateMoneyAccountLite, shouldShowFirstRunOnboarding } from './onboardingGate'

describe('shouldShowFirstRunOnboarding', () => {
  it('shows for brand-new users with no money accounts', () => {
    expect(
      shouldShowFirstRunOnboarding({
        onboardingCompletedAt: null,
        moneyAccountCount: 0,
        walkthroughActive: false,
        walkthroughActiveForCurrentAccount: false,
      }),
    ).toBe(true)
  })

  it('keeps walkthrough open until completed', () => {
    expect(
      shouldShowFirstRunOnboarding({
        onboardingCompletedAt: null,
        moneyAccountCount: 1,
        walkthroughActive: true,
        walkthroughActiveForCurrentAccount: false,
      }),
    ).toBe(true)
  })

  it('never reopens after onboarding_completed_at is set', () => {
    expect(
      shouldShowFirstRunOnboarding({
        onboardingCompletedAt: '2026-07-01T00:00:00Z',
        moneyAccountCount: 0,
        walkthroughActive: true,
        walkthroughActiveForCurrentAccount: true,
      }),
    ).toBe(false)
  })
})

describe('shouldShowCreateMoneyAccountLite', () => {
  it('shows a light create when onboarded but account-less', () => {
    expect(
      shouldShowCreateMoneyAccountLite({
        onboardingCompletedAt: '2026-07-01T00:00:00Z',
        moneyAccountCount: 0,
      }),
    ).toBe(true)
  })

  it('hides when accounts exist', () => {
    expect(
      shouldShowCreateMoneyAccountLite({
        onboardingCompletedAt: '2026-07-01T00:00:00Z',
        moneyAccountCount: 1,
      }),
    ).toBe(false)
  })
})
