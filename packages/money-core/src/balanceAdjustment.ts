/** System category for reconcile / set_balance balancing entries. */
export const BALANCE_ADJUSTMENT_CATEGORY_NAME = 'Balance adjustment'

export function isBalanceAdjustmentCategory(name: string | null | undefined): boolean {
  return name === BALANCE_ADJUSTMENT_CATEGORY_NAME
}
