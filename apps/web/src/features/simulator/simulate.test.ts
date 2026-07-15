import { describe, expect, it } from 'vitest'
import { projectDebtPayoff, simulateScenario } from './simulate'
import type { ProjectCashflowInput } from '@/features/cashflow/projection'

const BASE: ProjectCashflowInput = {
  startingBalanceMinor: 100000,
  recurring: [],
  avgDailySpendMinor: 5000,
  from: new Date('2026-07-15T00:00:00Z'),
  days: 30,
}

describe('simulateScenario', () => {
  it('shows a one-off purchase pushing the balance negative', () => {
    const r = simulateScenario(BASE, { oneOffMinor: 40000 })
    // baseline ends at 100000 - 150000 = -50000; scenario 40000 lower
    expect(r.endDeltaMinor).toBe(-40000)
    expect(r.canAfford).toBe(false)
  })

  it('shows cutting everyday spend improving the end balance', () => {
    const r = simulateScenario(BASE, { spendCutPct: 20 })
    // 20% off 5000/day = 4000/day -> saves 1000/day * 30 = 30000
    expect(r.endDeltaMinor).toBe(30000)
  })

  it('reports affordability when the balance stays positive', () => {
    const r = simulateScenario(
      { ...BASE, startingBalanceMinor: 500000 },
      { oneOffMinor: 100000 },
    )
    expect(r.canAfford).toBe(true)
    expect(r.lowestDeltaMinor).toBe(-100000)
  })

  it('is a no-op with no adjustments', () => {
    const r = simulateScenario(BASE, {})
    expect(r.endDeltaMinor).toBe(0)
    expect(r.lowestDeltaMinor).toBe(0)
  })

  it('treats an extra debt payment like a one-off draw on the balance', () => {
    const r = simulateScenario(BASE, { extraDebtPaymentMinor: 20000 })
    expect(r.endDeltaMinor).toBe(-20000)
  })
})

describe('projectDebtPayoff', () => {
  it('divides an interest-free balance evenly by the payment', () => {
    const r = projectDebtPayoff({ balanceMinor: 500000, annualRatePct: null, extraMonthlyMinor: 100000 })
    expect(r.monthsToPayoff).toBe(5)
    expect(r.totalInterestMinor).toBe(0)
  })

  it('accounts for interest accrual when computing months to payoff', () => {
    const r = projectDebtPayoff({ balanceMinor: 1000000, annualRatePct: 24, extraMonthlyMinor: 100000 })
    // 2% monthly rate; payment well above the ~20000 first-month interest.
    expect(r.monthsToPayoff).not.toBeNull()
    expect(r.monthsToPayoff!).toBeGreaterThan(10) // more than the interest-free 10 months
    expect(r.totalInterestMinor!).toBeGreaterThan(0)
  })

  it('returns null when the payment does not even cover accruing interest', () => {
    const r = projectDebtPayoff({ balanceMinor: 1000000, annualRatePct: 24, extraMonthlyMinor: 10000 })
    expect(r.monthsToPayoff).toBeNull()
    expect(r.totalInterestMinor).toBeNull()
  })

  it('treats an already-cleared balance as paid off instantly', () => {
    expect(projectDebtPayoff({ balanceMinor: 0, annualRatePct: 10, extraMonthlyMinor: 500 })).toEqual({
      monthsToPayoff: 0,
      totalInterestMinor: 0,
    })
  })
})
