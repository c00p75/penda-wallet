import { projectCashflow, type CashflowProjection, type ProjectCashflowInput } from '@/features/cashflow/projection'

export interface ScenarioAdjustments {
  /** A one-off purchase made today. */
  oneOffMinor?: number
  /** Percent to trim everyday spend by (0–100). */
  spendCutPct?: number
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
  const oneOff = adj.oneOffMinor ?? 0
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
