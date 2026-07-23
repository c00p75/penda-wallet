export type MissionStatus = 'active' | 'kept' | 'broken' | 'dismissed'

export interface FinancialMission {
  id: string
  wallet_id: string
  created_by: string
  title: string
  description: string | null
  start_date: string
  end_date: string
  status: MissionStatus
  archived_at: string | null
  created_at: string
}

export interface FinancialMissionInput {
  title: string
  description?: string | null
  start_date: string
  end_date: string
  status?: MissionStatus
}
