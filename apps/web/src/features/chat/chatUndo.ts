import type { ChatAction, ChatUndoTarget } from './types'

const CREATE_SOFT_DELETE_TOOLS = new Set(['create_transaction', 'log_borrowed_or_lent_money'])
const CREATE_HARD_DELETE_TOOLS = new Set([
  'create_budget',
  'create_goal',
  'create_debt',
  'create_category',
  'create_recurring_transaction',
  'create_pact',
])

/**
 * Collect undo targets from trail actions that already took effect
 * (creates, auto-applied updates/deletes, confirmed mutations).
 */
export function undoTargetsFromChatActions(actions: ChatAction[] | undefined): ChatUndoTarget[] {
  if (!actions?.length) return []
  const out: ChatUndoTarget[] = []
  const seen = new Set<string>()

  for (const a of actions) {
    if (
      a.status === 'error' ||
      a.status === 'running' ||
      a.status === 'cancelled' ||
      a.status === 'pending'
    ) {
      continue
    }

    if (a.tool === 'update_record' || a.tool === 'delete_record' || a.tool === 'set_balance') {
      if ((a.status === 'done' || a.status === 'confirmed') && a.id) {
        const key = `pending:${a.id}`
        if (!seen.has(key)) {
          seen.add(key)
          out.push({ type: 'pending_action', actionId: a.id })
        }
      }
      continue
    }

    if (a.status !== 'done') continue

    if (CREATE_SOFT_DELETE_TOOLS.has(a.tool)) {
      // create_transaction keeps its entry in targetId. Borrow/lend puts the debt
      // there, since that is what the row's domain names, and the entry in
      // transactionId; threads persisted before that split still use targetId.
      const transactionId = a.transactionId ?? a.targetId
      if (transactionId) {
        const key = `tx:${transactionId}`
        if (!seen.has(key)) {
          seen.add(key)
          out.push({ type: 'soft_delete_transaction', transactionId })
        }
      }
      // Borrow/lend saved a debt in the same breath, so undoing only the entry
      // would leave the debt standing.
      if (a.tool === 'log_borrowed_or_lent_money' && a.transactionId && a.targetId) {
        const key = `created:${a.domain}:${a.targetId}`
        if (!seen.has(key)) {
          seen.add(key)
          out.push({ type: 'delete_created', domain: a.domain, targetId: a.targetId })
        }
      }
      continue
    }

    if (CREATE_HARD_DELETE_TOOLS.has(a.tool) && a.targetId) {
      const key = `created:${a.domain}:${a.targetId}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({ type: 'delete_created', domain: a.domain, targetId: a.targetId })
      }
    }
  }

  return out
}

/** Merge stored targets with those inferred from the trail (and legacy delete-undo). */
export function resolveUndoTargets(message: {
  actions?: ChatAction[]
  undoTargets?: ChatUndoTarget[]
  undoTransactionId?: string
}): ChatUndoTarget[] {
  const fromActions = undoTargetsFromChatActions(message.actions)
  const stored = message.undoTargets ?? []
  const out: ChatUndoTarget[] = []
  const seen = new Set<string>()

  for (const t of [...stored, ...fromActions]) {
    const key =
      t.type === 'pending_action'
        ? `pending:${t.actionId}`
        : t.type === 'soft_delete_transaction' || t.type === 'restore_soft_deleted_transaction'
          ? `${t.type}:${t.transactionId}`
          : `created:${t.domain}:${t.targetId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }

  if (message.undoTransactionId) {
    const key = `restore_soft_deleted_transaction:${message.undoTransactionId}`
    if (!seen.has(key)) {
      out.push({
        type: 'restore_soft_deleted_transaction',
        transactionId: message.undoTransactionId,
      })
    }
  }

  return out
}
