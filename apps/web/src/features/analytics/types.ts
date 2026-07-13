export interface CategoryTotal {
  category: string
  amount_minor: number
}

export interface Insight {
  id: string
  wallet_id: string
  type: 'weekly_digest' | 'anomaly' | 'recommendation' | 'goal_forecast'
  content: { text: string; total_spent_minor: number; total_income_minor: number; top_categories: CategoryTotal[] }
  period_start: string | null
  period_end: string | null
  dismissed_at: string | null
  created_at: string
}
