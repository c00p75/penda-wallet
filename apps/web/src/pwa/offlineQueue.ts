import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { TransactionInput } from '@/features/transactions/types'

interface PendingTransaction {
  id: string
  wallet_id: string
  created_by: string
  input: TransactionInput
  queued_at: string
}

interface PendaDB extends DBSchema {
  'pending-transactions': {
    key: string
    value: PendingTransaction
  }
}

let dbPromise: Promise<IDBPDatabase<PendaDB>> | null = null

function getDb() {
  dbPromise ??= openDB<PendaDB>('penda-offline', 1, {
    upgrade(db) {
      db.createObjectStore('pending-transactions', { keyPath: 'id' })
    },
  })
  return dbPromise
}

export async function enqueueTransaction(
  walletId: string,
  userId: string,
  input: TransactionInput,
): Promise<PendingTransaction> {
  const pending: PendingTransaction = {
    id: crypto.randomUUID(),
    wallet_id: walletId,
    created_by: userId,
    input,
    queued_at: new Date().toISOString(),
  }
  const db = await getDb()
  await db.put('pending-transactions', pending)
  return pending
}

export async function listPendingTransactions(): Promise<PendingTransaction[]> {
  const db = await getDb()
  return db.getAll('pending-transactions')
}

export async function removePendingTransaction(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('pending-transactions', id)
}

/**
 * Attempt to sync every queued transaction. Successfully synced entries are
 * removed; failures stay queued for the next attempt. Returns the number
 * synced.
 */
export async function flushPendingTransactions(
  insert: (walletId: string, userId: string, input: TransactionInput) => Promise<unknown>,
): Promise<number> {
  const pending = await listPendingTransactions()
  let synced = 0
  for (const item of pending) {
    try {
      await insert(item.wallet_id, item.created_by, item.input)
      await removePendingTransaction(item.id)
      synced++
    } catch {
      // Still offline or rejected — keep it queued and let the next flush retry.
    }
  }
  return synced
}
