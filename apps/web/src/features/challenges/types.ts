export type ChallengeType = 'savings_target' | 'spending_limit' | 'no_spend_streak'

export interface ChallengeTargetMetric {
  amount_minor?: number
  currency?: string
  days?: number
}

export interface Challenge {
  id: string
  name: string
  creator_id: string
  type: ChallengeType
  target_metric: ChallengeTargetMetric
  start_date: string
  end_date: string
  invite_code: string
  /** Wallet that scopes leaderboard scoring; null on legacy challenges. */
  wallet_id: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface ChallengeInput {
  name: string
  type: ChallengeType
  target_metric: ChallengeTargetMetric
  start_date: string
  end_date: string
  wallet_id: string
}

export interface LeaderboardEntry {
  user_id: string
  display_name: string
  value: number
  joined_at: string
}
