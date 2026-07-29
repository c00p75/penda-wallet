import { describe, expect, it } from 'vitest'
import { DEBT_PAYMENT_CATEGORY_NAME, isDebtPaymentCategory } from './debtPaymentCategory'

describe('isDebtPaymentCategory', () => {
  it('matches the system category name exactly', () => {
    expect(isDebtPaymentCategory(DEBT_PAYMENT_CATEGORY_NAME)).toBe(true)
    expect(isDebtPaymentCategory('Debt payment')).toBe(true)
  })

  it('rejects other names and empty values', () => {
    expect(isDebtPaymentCategory('Transfer')).toBe(false)
    expect(isDebtPaymentCategory('debt payment')).toBe(false)
    expect(isDebtPaymentCategory(null)).toBe(false)
    expect(isDebtPaymentCategory(undefined)).toBe(false)
  })
})
