import type { Category } from '@/features/categories/types'

export type TransactionType = 'expense' | 'income' | 'transfer'
export type TransactionSource = 'manual' | 'chat' | 'voice' | 'receipt' | 'recurring' | 'sms'

export interface Transaction {
  id: string
  wallet_id: string
  created_by: string
  category_id: string | null
  amount_minor: number
  currency: string
  type: TransactionType
  merchant: string | null
  description: string | null
  transaction_date: string
  source: TransactionSource
  receipt_storage_path: string | null
  user_confirmed: boolean
  version: number
  deleted_at: string | null
  created_at: string
  updated_at: string
  category: Category | null
}

export interface TransactionInput {
  category_id: string | null
  amount_minor: number
  currency: string
  type: TransactionType
  merchant: string | null
  description: string | null
  transaction_date: string
  /** Defaults to 'manual' server-side when omitted. */
  source?: TransactionSource
}

/** Pre-fill for a brand-new transaction (e.g. from a parsed MoMo message). */
export interface TransactionDraft {
  type: TransactionType
  amount_minor: number
  merchant: string | null
  description: string | null
  transaction_date: string
  source?: TransactionSource
}
