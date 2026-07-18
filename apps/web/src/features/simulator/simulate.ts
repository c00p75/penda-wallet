import { projectCashflow, type CashflowProjection, type ProjectCashflowInput } from '@/features/cashflow/projection'

export interface ScenarioAdjustments {
  /** A one-off purchase made today. */
  oneOffMinor?: number
  /** Percent to trim everyday spend by (0–100). */
  spendCutPct?: number
  /** Extra one-time payment toward a debt this month, on top of everyday spend. */
  extraDebtPaymentMinor?: number
}

export interface ScenarioResult {
  baseline: CashflowProjection
  scenario: CashflowProjection
  /** scenario end balance − baseline end balance over the horizon. */
  endDeltaMinor: number
  /** scenario lowest balance − baseline lowest balance. */
  lowestDeltaMinor: number
  /** True if the balance never dips below zero across the horizon. */
  canAfford: boolean
}

function endBalance(p: CashflowProjection): number {
  return p.days.length ? p.days[p.days.length - 1].balanceMinor : 0
}

/**
 * Model "what if?" against the cashflow projection: a one-off purchase and/or a
 * cut to everyday spend, returned as a baseline-vs-scenario comparison. Powers
 * the shopping companion ("Can I buy this?") and the savings sliders.
 */
export function simulateScenario(base: ProjectCashflowInput, adj: ScenarioAdjustments): ScenarioResult {
  const oneOff = (adj.oneOffMinor ?? 0) + (adj.extraDebtPaymentMinor ?? 0)
  const cut = Math.min(100, Math.max(0, adj.spendCutPct ?? 0))

  const baseline = projectCashflow(base)
  const scenario = projectCashflow({
    ...base,
    startingBalanceMinor: base.startingBalanceMinor - oneOff,
    avgDailySpendMinor: Math.round(base.avgDailySpendMinor * (1 - cut / 100)),
  })

  return {
    baseline,
    scenario,
    endDeltaMinor: endBalance(scenario) - endBalance(baseline),
    lowestDeltaMinor: scenario.lowestBalance.balanceMinor - baseline.lowestBalance.balanceMinor,
    canAfford: scenario.lowestBalance.balanceMinor >= 0,
  }
}

export interface DebtPayoffInput {
  balanceMinor: number
  /** Annual interest rate as a percentage (e.g. 12.5), matching how it's entered on the debt form. Null/0 = no interest. */
  annualRatePct: number | null
  /** Extra amount paid toward this debt every month. */
  extraMonthlyMinor: number
}

export interface DebtPayoffResult {
  /** Months to clear the balance at this payment. Null if the payment never even covers the accruing interest. */
  monthsToPayoff: number | null
  totalInterestMinor: number | null
}

/**
 * Model "what if I paid extra toward this debt?" (roadmap bet #6's debt-payoff
 * scenario slider), standard amortization: how many months to zero the
 * balance, and the total interest paid along the way, at a given extra
 * monthly payment.
 */
export function projectDebtPayoff(input: DebtPayoffInput): DebtPayoffResult {
  const { balanceMinor, annualRatePct, extraMonthlyMinor } = input
  if (balanceMinor <= 0) return { monthsToPayoff: 0, totalInterestMinor: 0 }
  if (extraMonthlyMinor <= 0) return { monthsToPayoff: null, totalInterestMinor: null }

  const monthlyRate = (annualRatePct ?? 0) / 100 / 12
  if (monthlyRate <= 0) {
    const months = Math.ceil(balanceMinor / extraMonthlyMinor)
    return { monthsToPayoff: months, totalInterestMinor: 0 }
  }

  // A payment that doesn't even cover the first month's interest never pays off the balance.
  const firstMonthInterest = balanceMinor * monthlyRate
  if (extraMonthlyMinor <= firstMonthInterest) return { monthsToPayoff: null, totalInterestMinor: null }

  const months = Math.ceil(-Math.log(1 - (monthlyRate * balanceMinor) / extraMonthlyMinor) / Math.log(1 + monthlyRate))
  const totalInterestMinor = Math.round(months * extraMonthlyMinor - balanceMinor)
  return { monthsToPayoff: months, totalInterestMinor }
}
