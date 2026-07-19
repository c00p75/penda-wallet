import type { Transaction } from '@/features/transactions/types'

/** Running wallet balance from confirmed ledger rows (income − expense). */
export function walletBalanceMinor(
  transactions: Array<{
    type: string
    amount_minor: number
    converted_amount_minor?: number | null
  }>,
): number {
  return transactions.reduce((sum, tx) => {
    const amt = tx.converted_amount_minor ?? tx.amount_minor
    if (tx.type === 'income') return sum + amt
    if (tx.type === 'expense') return sum - amt
    return sum
  }, 0)
}

/**
 * How much of a specific cash-in is still unspent (expenses on/after that date,
 * same calendar month). Negative when already overspent.
 */
export function remainingFromCashInMinor(
  transactions: Transaction[],
  income: Pick<Transaction, 'transaction_date' | 'amount_minor' | 'converted_amount_minor'>,
  opts?: { now?: Date },
): number {
  const now = opts?.now ?? new Date()
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const incomeAmt = income.converted_amount_minor ?? income.amount_minor
  const spentAfter = transactions
    .filter(
      (t) =>
        t.type === 'expense' &&
        t.transaction_date >= income.transaction_date &&
        t.transaction_date.startsWith(monthPrefix),
    )
    .reduce((s, t) => s + (t.converted_amount_minor ?? t.amount_minor), 0)
  return incomeAmt - spentAfter
}
