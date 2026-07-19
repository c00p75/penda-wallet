export type PactStakeKind = 'none' | 'charity' | 'friend'

export interface CommitmentPact {
  id: string
  wallet_id: string
  created_by: string
  description: string
  category_id: string | null
  goal_id: string | null
  start_date: string
  end_date: string
  stake_kind: PactStakeKind | null
  stake_amount_minor: number | null
  stake_note: string | null
  created_at: string
}

export interface CommitmentPactInput {
  description: string
  category_id: string | null
  goal_id: string | null
  start_date: string
  end_date: string
  stake_kind?: PactStakeKind | null
  stake_amount_minor?: number | null
  stake_note?: string | null
}
