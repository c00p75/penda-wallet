import type { Category } from '@/features/categories/types'

export type TransactionType = 'expense' | 'income' | 'transfer'
export type TransactionSource = 'manual' | 'chat' | 'voice' | 'receipt' | 'recurring' | 'sms'

/** Line item extracted from a receipt photo (stored on ai_extraction). */
export interface ReceiptExtractionItem {
  description: string
  quantity: number
  amount_minor: number
  /** Category name suggestion for this line; may differ across items. */
  suggested_category?: string | null
}

export interface ReceiptExtraction {
  merchant?: string | null
  transaction_date?: string | null
  total_minor?: number
  currency?: string
  suggested_category?: string | null
  items?: ReceiptExtractionItem[]
}

export interface Transaction {
  id: string
  wallet_id: string
  created_by: string
  category_id: string | null
  amount_minor: number
  currency: string
  fx_rate_to_wallet_base: number | null
  converted_amount_minor: number | null
  type: TransactionType
  merchant: string | null
  description: string | null
  transaction_date: string
  source: TransactionSource
  receipt_storage_path: string | null
  ai_extraction: ReceiptExtraction | null
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

/** Shared fields + editable lines when confirming a multi-item receipt. */
export interface ReceiptItemsConfirmInput {
  currency: string
  type: TransactionType
  merchant: string | null
  transaction_date: string
  items: Array<{ description: string; amount_minor: number; category_id: string | null }>
}

/** Pre-fill for a brand-new transaction (e.g. from a parsed MoMo message). */
export interface TransactionDraft {
  type: TransactionType
  amount_minor: number
  merchant: string | null
  description: string | null
  transaction_date: string
  source?: TransactionSource
  /** MoMo SMS reported balance — used to seed a reconcile prompt after save. */
  reported_balance_minor?: number | null
}
