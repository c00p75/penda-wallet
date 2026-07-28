/**
 * First-run onboarding is money-account anchored: once the user finishes the
 * quiz/walkthrough, creating pockets or extra money accounts must not reopen it.
 */

export function shouldShowFirstRunOnboarding(input: {
  onboardingCompletedAt: string | null | undefined
  moneyAccountCount: number
  walkthroughActive: boolean
  walkthroughActiveForCurrentAccount: boolean
}): boolean {
  const onboarded = !!input.onboardingCompletedAt
  if (onboarded) return false
  if (input.moneyAccountCount === 0) return true
  return input.walkthroughActive || input.walkthroughActiveForCurrentAccount
}

export function shouldShowCreateMoneyAccountLite(input: {
  onboardingCompletedAt: string | null | undefined
  moneyAccountCount: number
}): boolean {
  return !!input.onboardingCompletedAt && input.moneyAccountCount === 0
}
