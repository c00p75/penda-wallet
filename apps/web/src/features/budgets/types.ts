export type BudgetPeriod = 'weekly' | 'monthly'

export interface Budget {
  id: string
  wallet_id: string
  category_id: string | null
  amount_minor: number
  period: BudgetPeriod
  rollover: boolean
  start_date: string
  created_at: string
  updated_at: string
}

export interface BudgetInput {
  category_id: string | null
  amount_minor: number
  period: BudgetPeriod
  rollover: boolean
}

export interface BudgetProgress {
  budget_id: string
  category_id: string | null
  amount_minor: number
  period: BudgetPeriod
  rollover: boolean
  period_start: string
  period_end: string
  spent_minor: number
  /** Unspent (or overspent) carried forward from prior periods. Zero unless `rollover`. */
  carried_over_minor: number
  /** The real cap for this period: `amount_minor + carried_over_minor`. */
  effective_amount_minor: number
}
