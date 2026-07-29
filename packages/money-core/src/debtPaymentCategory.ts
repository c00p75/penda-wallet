/** System category for debt-payment linked transactions (see debts feature). */
export const DEBT_PAYMENT_CATEGORY_NAME = 'Debt payment'

export function isDebtPaymentCategory(name: string | null | undefined): boolean {
  return name === DEBT_PAYMENT_CATEGORY_NAME
}
