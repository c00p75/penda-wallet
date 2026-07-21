/**
 * Explainability for safe-to-spend: why the number is what it is.
 */

export interface SafeToSpendExplainInput {
  intendedMinor: number
  spentMinor: number
  upcomingFixedMinor: number
  daysLeftInMonth: number
  safeDailyMinor: number
  safeTotalMinor: number
}

export interface SafeToSpendEvidence {
  summary: string
  bullets: string[]
}

export function explainSafeToSpend(
  input: SafeToSpendExplainInput,
  format: (minor: number) => string,
): SafeToSpendEvidence {
  const remainingPlan = Math.max(0, input.intendedMinor - input.spentMinor)
  const afterFixed = Math.max(0, remainingPlan - input.upcomingFixedMinor)
  const bullets = [
    `Spending limit: ${format(input.intendedMinor)}`,
    `Already spent: ${format(input.spentMinor)} → ${format(remainingPlan)} still okay to spend`,
    `Upcoming fixed costs still due: ${format(input.upcomingFixedMinor)}`,
    `Flexible pool after fixed: ${format(afterFixed)}`,
    `${input.daysLeftInMonth} day(s) left → about ${format(input.safeDailyMinor)}/day`,
  ]
  return {
    summary: `Safe to spend is ${format(input.safeDailyMinor)}/day (${format(input.safeTotalMinor)} left flexible).`,
    bullets,
  }
}
