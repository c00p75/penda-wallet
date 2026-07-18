import { describe, expect, it } from 'vitest'
import { computeConfidenceScore } from './confidenceScore'

describe('computeConfidenceScore', () => {
  it('scores high when cashflow, goals, and budgets are healthy', () => {
    const result = computeConfidenceScore({
      balanceMinor: 500_000,
      monthIncomeMinor: 300_000,
      monthExpenseMinor: 150_000,
      goalProgressAvg: 0.8,
      budgetAdherence: 0.9,
    })
    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(['strong', 'excellent']).toContain(result.label)
  })

  it('scores low when overdrawn and overspending', () => {
    const result = computeConfidenceScore({
      balanceMinor: -100_000,
      monthIncomeMinor: 50_000,
      monthExpenseMinor: 200_000,
      goalProgressAvg: 0.1,
      budgetAdherence: 0.2,
    })
    expect(result.score).toBeLessThan(45)
    expect(result.label).toBe('building')
  })

  it('clamps to 0–100', () => {
    const result = computeConfidenceScore({
      balanceMinor: 10_000_000,
      monthIncomeMinor: 1_000_000,
      monthExpenseMinor: 0,
      goalProgressAvg: 1,
      budgetAdherence: 1,
    })
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })
})
