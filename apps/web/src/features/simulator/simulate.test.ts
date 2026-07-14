import { describe, expect, it } from 'vitest'
import { simulateScenario } from './simulate'
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
})
