export interface SpendingPlan {
  id: string
  wallet_id: string
  month: string
  intended_amount_minor: number
  reflection: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface SpendingPlanInput {
  month: string
  intended_amount_minor: number
  reflection: string | null
}
