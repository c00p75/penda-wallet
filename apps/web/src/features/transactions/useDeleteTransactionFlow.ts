import { useState } from 'react'
import { useReverseDebtPayment } from '@/features/debts/hooks'
import type { Account } from '@/features/accounts/types'
import { useDeleteTransaction } from './hooks'
import { resolveTransactionLinkage, type TransactionLinkage } from './transactionLinkage'
import type { Transaction } from './types'

interface PendingDelete {
  transaction: Transaction
  linkage: TransactionLinkage
}

/**
 * Shared delete-confirmation flow: gate every delete behind a dialog, and
 * when the transaction is one leg of a transfer or posted a debt payment,
 * offer to reverse that side too so the money isn't left stranded.
 */
export function useDeleteTransactionFlow(
  walletId: string | undefined,
  transactions: Transaction[],
  accounts: Account[],
) {
  const [pending, setPending] = useState<PendingDelete | null>(null)
  const [reverseLinked, setReverseLinked] = useState(true)
  const deleteTransaction = useDeleteTransaction(walletId)
  const reversePayment = useReverseDebtPayment(walletId)

  async function requestDelete(transaction: Transaction) {
    setReverseLinked(true)
    setPending({ transaction, linkage: null })
    const linkage = await resolveTransactionLinkage(transaction, transactions, accounts).catch(() => null)
    setPending((current) => (current?.transaction.id === transaction.id ? { transaction, linkage } : current))
  }

  function cancel() {
    setPending(null)
  }

  async function confirm(): Promise<void> {
    if (!pending) return
    const { transaction, linkage } = pending
    await deleteTransaction.mutateAsync(transaction.id)
    if (reverseLinked && linkage?.kind === 'transfer') {
      await deleteTransaction.mutateAsync(linkage.siblingId)
    } else if (reverseLinked && linkage?.kind === 'debt_payment') {
      await reversePayment.mutateAsync(linkage.paymentId)
    }
    setPending(null)
  }

  return {
    pending,
    reverseLinked,
    setReverseLinked,
    requestDelete,
    cancel,
    confirm,
    isPending: deleteTransaction.isPending || reversePayment.isPending,
  }
}
