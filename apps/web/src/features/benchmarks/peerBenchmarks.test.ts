import { describe, expect, it } from 'vitest'
import {
  compareSpendToBenchmark,
  incomeMidpointMinor,
  peerBenchmarksForBand,
} from './peerBenchmarks'

describe('peerBenchmarks', () => {
  it('returns empty for unknown / prefer-not bands', () => {
    expect(peerBenchmarksForBand(null)).toEqual([])
    expect(peerBenchmarksForBand('prefer_not_to_say')).toEqual([])
  })

  it('scales category tips from income band midpoint', () => {
    const mid = incomeMidpointMinor('stable')!
    const benches = peerBenchmarksForBand('stable')
    expect(benches.length).toBeGreaterThan(0)
    expect(benches[0]!.amountMinor).toBe(Math.round(mid * benches[0]!.shareOfIncome))
  })

  it('compares spend to benchmark bands', () => {
    expect(compareSpendToBenchmark(80, 100)).toBe('under')
    expect(compareSpendToBenchmark(100, 100)).toBe('near')
    expect(compareSpendToBenchmark(130, 100)).toBe('over')
  })
})
