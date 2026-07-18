import { describe, expect, it } from 'vitest'
import { convertViaUsdRates, ledgerAmountMinor } from './fx'

describe('ledgerAmountMinor', () => {
  it('prefers converted amount', () => {
    expect(ledgerAmountMinor({ amount_minor: 100, converted_amount_minor: 80 })).toBe(80)
    expect(ledgerAmountMinor({ amount_minor: 100, converted_amount_minor: null })).toBe(100)
  })
})

describe('convertViaUsdRates', () => {
  it('identity when currencies match', () => {
    expect(convertViaUsdRates(500, 'GHS', 'GHS', {})).toEqual({ rate: 1, convertedMinor: 500 })
  })

  it('converts via USD pivot', () => {
    // 1 USD = 15 GHS, 1 USD = 0.9 EUR → 1500 GHS → 100 USD → 90 EUR
    const rates = { GHS: 15, EUR: 0.9 }
    const result = convertViaUsdRates(1500, 'GHS', 'EUR', rates)
    expect(result?.convertedMinor).toBe(90)
    expect(result?.rate).toBeCloseTo(0.06)
  })

  it('returns null when a rate is missing', () => {
    expect(convertViaUsdRates(100, 'GHS', 'EUR', { GHS: 15 })).toBeNull()
  })
})
