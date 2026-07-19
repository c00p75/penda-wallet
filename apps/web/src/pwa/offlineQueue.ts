import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { TransactionInput } from '@/features/transactions/types'
import {
  MAX_PENDING_AI_CONFIRMS,
  MAX_PENDING_CHAT,
  assertUnderCap,
  confirmIdsToReplace,
  shouldDropFailedAiConfirm,
  sortByQueuedAt,
} from './offlineQueueLogic'

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

export interface PendingAiConfirm {
  id: string
  action_id: string
  decision: 'confirm' | 'cancel'
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
  'pending-ai-confirms': {
    key: string
    value: PendingAiConfirm
  }
}

let dbPromise: Promise<IDBPDatabase<PendaDB>> | null = null

function getDb() {
  dbPromise ??= openDB<PendaDB>('penda-offline', 3, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('pending-transactions', { keyPath: 'id' })
      }
      if (oldVersion < 2 && !db.objectStoreNames.contains('pending-chat-messages')) {
        db.createObjectStore('pending-chat-messages', { keyPath: 'id' })
      }
      if (oldVersion < 3 && !db.objectStoreNames.contains('pending-ai-confirms')) {
        db.createObjectStore('pending-ai-confirms', { keyPath: 'id' })
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
  const pending = sortByQueuedAt(await listPendingTransactions())
  let synced = 0
  for (const item of pending) {
    try {
      await insert(item.wallet_id, item.created_by, item.input)
      await removePendingTransaction(item.id)
      synced++
    } catch {
      // Still offline or rejected, keep queued.
    }
  }
  return synced
}

export async function enqueueChatMessage(walletId: string, text: string): Promise<PendingChatMessage> {
  const db = await getDb()
  const existing = await db.getAll('pending-chat-messages')
  assertUnderCap(existing.length, MAX_PENDING_CHAT, 'chat messages')
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
  const pending = sortByQueuedAt(await listPendingChatMessages())
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

export async function enqueueAiConfirm(
  actionId: string,
  decision: 'confirm' | 'cancel',
): Promise<PendingAiConfirm> {
  const db = await getDb()
  const existing = await db.getAll('pending-ai-confirms')
  const replacing = confirmIdsToReplace(existing, actionId)
  // Replacing a prior decision for the same action does not grow the queue.
  if (replacing.length === 0) {
    assertUnderCap(existing.length, MAX_PENDING_AI_CONFIRMS, 'AI confirms')
  }
  for (const id of replacing) {
    await db.delete('pending-ai-confirms', id)
  }
  const pending: PendingAiConfirm = {
    id: crypto.randomUUID(),
    action_id: actionId,
    decision,
    queued_at: new Date().toISOString(),
  }
  await db.put('pending-ai-confirms', pending)
  return pending
}

export async function listPendingAiConfirms(): Promise<PendingAiConfirm[]> {
  const db = await getDb()
  return db.getAll('pending-ai-confirms')
}

export async function removePendingAiConfirm(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('pending-ai-confirms', id)
}

export async function flushPendingAiConfirms(
  confirm: (actionId: string, decision: 'confirm' | 'cancel') => Promise<unknown>,
): Promise<number> {
  const pending = sortByQueuedAt(await listPendingAiConfirms())
  let synced = 0
  for (const item of pending) {
    try {
      await confirm(item.action_id, item.decision)
      await removePendingAiConfirm(item.id)
      synced++
    } catch (error) {
      // Lost races / already-applied confirms must not stick forever.
      if (shouldDropFailedAiConfirm(error)) {
        await removePendingAiConfirm(item.id)
        synced++
        continue
      }
      // Keep for next flush.
    }
  }
  return synced
}
