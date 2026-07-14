import { describe, expect, it } from 'vitest'
import { MODE_CONFIG, termFor, type ProfileMode } from './modes'

describe('profile mode terminology', () => {
  it('relabels core concepts per mode', () => {
    expect(termFor('business', 'income')).toBe('Revenue')
    expect(termFor('business', 'expense')).toBe('Expenses')
    expect(termFor('family', 'income')).toBe('Household income')
    expect(termFor('individual', 'income')).toBe('Income')
    expect(termFor('individual', 'balance')).toBe('Balance')
  })

  it('falls back to individual terms for an unknown mode', () => {
    expect(termFor('nope' as ProfileMode, 'income')).toBe('Income')
  })

  it('carries distinct AI framing for each mode', () => {
    const contexts = Object.values(MODE_CONFIG).map((m) => m.aiContext)
    expect(new Set(contexts).size).toBe(contexts.length)
    expect(MODE_CONFIG.business.aiContext).toMatch(/runway|margin|tax/i)
  })
})
