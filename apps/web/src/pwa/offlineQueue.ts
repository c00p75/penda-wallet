import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { TransactionInput } from '@/features/transactions/types'

interface PendingTransaction {
  id: string
  wallet_id: string
  created_by: string
  input: TransactionInput
  queued_at: string
}

export interface PendingChatMessage {
  id: string
  wallet_id: string
  text: string
  queued_at: string
}

interface PendaDB extends DBSchema {
  'pending-transactions': {
    key: string
    value: PendingTransaction
  }
  'pending-chat-messages': {
    key: string
    value: PendingChatMessage
  }
}

const MAX_PENDING_CHAT = 10

let dbPromise: Promise<IDBPDatabase<PendaDB>> | null = null

function getDb() {
  dbPromise ??= openDB<PendaDB>('penda-offline', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('pending-transactions', { keyPath: 'id' })
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains('pending-chat-messages')) {
        db.createObjectStore('pending-chat-messages', { keyPath: 'id' })
      }
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
      // Still offline or rejected — keep queued.
    }
  }
  return synced
}

export async function enqueueChatMessage(walletId: string, text: string): Promise<PendingChatMessage> {
  const db = await getDb()
  const existing = await db.getAll('pending-chat-messages')
  if (existing.length >= MAX_PENDING_CHAT) {
    throw new Error('Too many queued chat messages — reconnect and try again.')
  }
  const pending: PendingChatMessage = {
    id: crypto.randomUUID(),
    wallet_id: walletId,
    text,
    queued_at: new Date().toISOString(),
  }
  await db.put('pending-chat-messages', pending)
  return pending
}

export async function listPendingChatMessages(): Promise<PendingChatMessage[]> {
  const db = await getDb()
  return db.getAll('pending-chat-messages')
}

export async function removePendingChatMessage(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('pending-chat-messages', id)
}

export async function flushPendingChatMessages(
  send: (walletId: string, text: string) => Promise<unknown>,
): Promise<number> {
  const pending = await listPendingChatMessages()
  let synced = 0
  for (const item of pending) {
    try {
      await send(item.wallet_id, item.text)
      await removePendingChatMessage(item.id)
      synced++
    } catch {
      // Keep for next flush.
    }
  }
  return synced
}
