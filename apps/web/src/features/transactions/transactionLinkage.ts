import { findTransferSibling, isDebtPaymentCategory } from '@penda/money-core'
import { fetchPaymentByTransactionId } from '@/features/debts/api'
import { pocketLabel } from '@/features/accounts/pocketLabel'
import type { Account } from '@/features/accounts/types'
import type { Transaction } from './types'

export type TransactionLinkage =
  | {
      kind: 'transfer'
      siblingId: string
      otherPocketLabel: string
      sourcePocketLabel: string
    }
  | {
      kind: 'debt_payment'
      paymentId: string
      debtName: string
      amountMinor: number
    }
  | null

/**
 * What deleting this transaction would leave dangling elsewhere: the other
 * leg of a pocket transfer, or the debt payment it posted. Null when the
 * transaction is a plain, unlinked entry.
 */
export async function resolveTransactionLinkage(
  tx: Transaction,
  transactions: Transaction[],
  accounts: Account[],
): Promise<TransactionLinkage> {
  if (tx.type === 'transfer') {
    const sibling = findTransferSibling(transactions, tx)
    if (sibling) {
      const outgoing = (tx.converted_amount_minor ?? -tx.amount_minor) < 0 ? tx : sibling
      return {
        kind: 'transfer',
        siblingId: sibling.id,
        otherPocketLabel: pocketLabel(accounts, sibling.account_id) ?? 'the other pocket',
        sourcePocketLabel: pocketLabel(accounts, outgoing.account_id) ?? 'the source pocket',
      }
    }
  }

  if (isDebtPaymentCategory(tx.category?.name)) {
    const payment = await fetchPaymentByTransactionId(tx.id)
    if (payment) {
      return {
        kind: 'debt_payment',
        paymentId: payment.id,
        debtName: payment.debt?.name ?? 'this debt',
        amountMinor: payment.amount_minor,
      }
    }
  }

  return null
}
