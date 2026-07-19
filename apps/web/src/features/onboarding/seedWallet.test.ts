import { describe, expect, it } from 'vitest'
import { intendedAmountFromIncome } from './seedWallet'

describe('intendedAmountFromIncome', () => {
  it('scales soft plan amounts by income vibe', () => {
    expect(intendedAmountFromIncome('tight')).toBeLessThan(intendedAmountFromIncome('stable'))
    expect(intendedAmountFromIncome('stable')).toBeLessThan(intendedAmountFromIncome('comfortable'))
    expect(intendedAmountFromIncome(null)).toBe(1_200_000)
  })
})
