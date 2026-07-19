import { describe, expect, it } from 'vitest'
import { buildSalaryPlan, salaryPlanChatSeed } from './salaryOrchestrator'

describe('buildSalaryPlan', () => {
  it('allocates tax → fixed → buffer → goals → fun', () => {
    const plan = buildSalaryPlan({
      incomeMinor: 100_000,
      taxReserveMinor: 10_000,
      fixedCostsMinor: 40_000,
      bufferMinor: 20_000,
      goalsMinor: 15_000,
    })
    expect(plan.slices.map((s) => s.key)).toEqual(['tax', 'fixed', 'buffer', 'goals', 'fun'])
    expect(plan.slices.find((s) => s.key === 'fun')?.amountMinor).toBe(15_000)
    expect(plan.shortfallMinor).toBe(0)
  })

  it('reports shortfall when income cannot cover wants', () => {
    const plan = buildSalaryPlan({
      incomeMinor: 50_000,
      fixedCostsMinor: 40_000,
      bufferMinor: 20_000,
      goalsMinor: 10_000,
    })
    expect(plan.shortfallMinor).toBeGreaterThan(0)
    expect(salaryPlanChatSeed(plan, 'USD')).toMatch(/Short by/)
  })

  it('chat seed has no em dashes', () => {
    const plan = buildSalaryPlan({
      incomeMinor: 50_000,
      fixedCostsMinor: 40_000,
      bufferMinor: 20_000,
      goalsMinor: 10_000,
    })
    expect(salaryPlanChatSeed(plan, 'USD')).not.toMatch(/—/)
  })
})
