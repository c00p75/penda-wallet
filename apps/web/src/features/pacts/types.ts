export interface CommitmentPact {
  id: string
  wallet_id: string
  created_by: string
  description: string
  category_id: string | null
  start_date: string
  end_date: string
  created_at: string
}

export interface CommitmentPactInput {
  description: string
  category_id: string | null
  start_date: string
  end_date: string
}
