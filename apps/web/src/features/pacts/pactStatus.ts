import type { Transaction } from '@/features/transactions/types'
import type { CommitmentPact } from './types'

export type PactStatus = 'active' | 'kept' | 'broken'

export interface PactStatusResult {
  status: PactStatus
  daysLeft: number
  /** The transaction that broke the pact, when status is 'broken'. */
  breakingTransaction: Transaction | null
}

/**
 * A pact restricts spending in a category over a date window. Status is
 * always computed fresh from transactions — never stored — so it can never
 * drift out of sync with the ledger (any expense in the pact's category
 * during its window breaks it; otherwise it's active until the window ends,
 * then kept).
 */
export function computePactStatus(
  pact: Pick<CommitmentPact, 'start_date' | 'end_date' | 'category_id'>,
  transactions: Transaction[],
  now: Date = new Date(),
): PactStatusResult {
  const today = now.toISOString().slice(0, 10)

  const breakingTransaction =
    transactions.find(
      (tx) =>
        tx.type === 'expense' &&
        tx.category_id === pact.category_id &&
        tx.transaction_date >= pact.start_date &&
        tx.transaction_date <= pact.end_date,
    ) ?? null

  if (breakingTransaction) return { status: 'broken', daysLeft: 0, breakingTransaction }
  if (today > pact.end_date) return { status: 'kept', daysLeft: 0, breakingTransaction: null }

  const daysLeft = Math.max(
    0,
    Math.round(
      (new Date(`${pact.end_date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000,
    ),
  )
  return { status: 'active', daysLeft, breakingTransaction: null }
}
