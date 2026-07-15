export type ReconciliationStatus = 'confirmed' | 'adjusted'

export interface BalanceReconciliation {
  id: string
  wallet_id: string
  user_id: string
  computed_balance_minor: number
  actual_balance_minor: number
  status: ReconciliationStatus
  created_at: string
}
