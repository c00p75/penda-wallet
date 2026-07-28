import { describe, expect, it } from 'vitest'
import { BALANCE_ADJUSTMENT_CATEGORY_NAME, isBalanceAdjustmentCategory } from './balanceAdjustment'

describe('isBalanceAdjustmentCategory', () => {
  it('matches the system category name exactly', () => {
    expect(isBalanceAdjustmentCategory(BALANCE_ADJUSTMENT_CATEGORY_NAME)).toBe(true)
    expect(isBalanceAdjustmentCategory('Balance adjustment')).toBe(true)
  })

  it('rejects other names and empty values', () => {
    expect(isBalanceAdjustmentCategory('Transfer')).toBe(false)
    expect(isBalanceAdjustmentCategory('balance adjustment')).toBe(false)
    expect(isBalanceAdjustmentCategory(null)).toBe(false)
    expect(isBalanceAdjustmentCategory(undefined)).toBe(false)
  })
})
