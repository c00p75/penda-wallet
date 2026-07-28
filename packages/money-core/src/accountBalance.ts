/**
 * Per-pocket (account) and money-account balance helpers.
 * Transfers are ignored at money-account level (net zero) but count per pocket.
 */

export type BalanceTxLike = {
  type: string
  amount_minor: number
  converted_amount_minor?: number | null
  account_id?: string | null
  /** For transfer legs: positive = money in, negative = money out. */
  transfer_signed?: boolean
}

function amt(tx: BalanceTxLike): number {
  return tx.converted_amount_minor ?? tx.amount_minor
}

/** Running money-account balance: income − expense (transfers ignored). */
export function moneyAccountBalanceMinor(transactions: readonly BalanceTxLike[]): number {
  return transactions.reduce((sum, tx) => {
    const a = amt(tx)
    if (tx.type === 'income') return sum + a
    if (tx.type === 'expense') return sum - a
    return sum
  }, 0)
}

/**
 * Balance for one pocket. Income +, expense −.
 * Transfer legs: amount_minor is always positive; use `transferDirection`
 * via type + description convention: we pass signed via a side channel.
 *
 * Convention used by the app: transfer rows store positive amount_minor and
 * set description prefix or we look at a `transfer_role` field. Simpler:
 * clients pass `transfer_signed_amount_minor` optionally.
 *
 * For rows with type === 'transfer', amount is applied as:
 * - if amount_minor >= 0 and we use signed convention in converted: treat
 *   converted_amount_minor as already signed when type is transfer.
 */
export function accountBalanceMinor(
  transactions: readonly BalanceTxLike[],
  accountId: string,
): number {
  return transactions.reduce((sum, tx) => {
    if (tx.account_id !== accountId) return sum
    const a = amt(tx)
    if (tx.type === 'income') return sum + a
    if (tx.type === 'expense') return sum - a
    if (tx.type === 'transfer') {
      // Transfer legs store signed converted_amount_minor (or amount_minor):
      // positive = in, negative = out. Fall back to +amount when unsigned.
      if (tx.converted_amount_minor != null) return sum + tx.converted_amount_minor
      return sum + a
    }
    return sum
  }, 0)
}

export type AccountBalanceRow = {
  accountId: string
  balanceMinor: number
}

/** Sum balances for every account id present in the tx set (plus known ids). */
export function balancesByAccount(
  transactions: readonly BalanceTxLike[],
  accountIds: readonly string[],
): AccountBalanceRow[] {
  return accountIds.map((accountId) => ({
    accountId,
    balanceMinor: accountBalanceMinor(transactions, accountId),
  }))
}
