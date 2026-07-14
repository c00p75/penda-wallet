export interface SavingsGoal {
  id: string
  wallet_id: string
  name: string
  icon: string | null
  target_amount_minor: number
  current_amount_minor: number
  target_date: string | null
  created_at: string
  updated_at: string
}

export interface SavingsGoalInput {
  name: string
  icon: string | null
  target_amount_minor: number
  target_date: string | null
}

export interface SavingsContribution {
  id: string
  goal_id: string
  amount_minor: number
  contributed_date: string
  created_at: string
}
