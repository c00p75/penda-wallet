export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurringTemplate {
  category_id: string | null
  amount_minor: number
  currency: string
  type: 'expense' | 'income'
  merchant: string | null
  description: string | null
}

export interface RecurringTransaction {
  id: string
  wallet_id: string
  created_by: string
  template: RecurringTemplate
  frequency: RecurringFrequency
  next_run_date: string
  last_run_date: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RecurringInput {
  template: RecurringTemplate
  frequency: RecurringFrequency
  next_run_date: string
}
