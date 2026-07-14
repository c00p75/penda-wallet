export type DebtDirection = 'owed_to_me' | 'i_owe'

export interface Debt {
  id: string
  wallet_id: string
  name: string
  direction: DebtDirection
  counterparty: string | null
  principal_minor: number
  balance_minor: number
  interest_rate: number | null
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface DebtInput {
  name: string
  direction: DebtDirection
  counterparty: string | null
  principal_minor: number
  interest_rate: number | null
  due_date: string | null
}

export interface DebtPayment {
  id: string
  debt_id: string
  amount_minor: number
  paid_date: string
}
