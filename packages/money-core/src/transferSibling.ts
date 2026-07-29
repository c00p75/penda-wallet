export interface TransferLegLike {
  id: string
  transfer_group_id: string | null
  account_id: string | null
}

/** The other leg of a two-sided pocket transfer, if present in the given list. */
export function findTransferSibling<T extends TransferLegLike>(transactions: T[], tx: T): T | null {
  if (!tx.transfer_group_id) return null
  return transactions.find((t) => t.transfer_group_id === tx.transfer_group_id && t.id !== tx.id) ?? null
}
