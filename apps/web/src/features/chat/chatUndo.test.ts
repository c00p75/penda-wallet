import { describe, expect, it } from 'vitest'
import { resolveUndoTargets, undoTargetsFromChatActions } from './chatUndo'
import type { ChatAction } from './types'

function action(partial: Partial<ChatAction> & Pick<ChatAction, 'tool' | 'status'>): ChatAction {
  return {
    id: partial.id ?? 'a1',
    domain: partial.domain ?? 'transaction',
    label: partial.label ?? 'Step',
    summary: partial.summary ?? 'Summary',
    ...partial,
  }
}

describe('undoTargetsFromChatActions', () => {
  it('collects auto-applied update/delete pending action ids', () => {
    expect(
      undoTargetsFromChatActions([
        action({
          id: 'pending-1',
          tool: 'update_record',
          status: 'done',
          targetId: 'tx1',
        }),
      ]),
    ).toEqual([{ type: 'pending_action', actionId: 'pending-1' }])
  })

  it('collects created transactions for soft-delete undo', () => {
    expect(
      undoTargetsFromChatActions([
        action({
          tool: 'create_transaction',
          status: 'done',
          targetId: 'tx9',
        }),
      ]),
    ).toEqual([{ type: 'soft_delete_transaction', transactionId: 'tx9' }])
  })

  it('skips creates without a target id and pending confirm rows', () => {
    expect(
      undoTargetsFromChatActions([
        action({ tool: 'create_transaction', status: 'done' }),
        action({ id: 'p1', tool: 'update_record', status: 'pending' }),
      ]),
    ).toEqual([])
  })
})

describe('resolveUndoTargets', () => {
  it('keeps legacy undoTransactionId as restore', () => {
    expect(
      resolveUndoTargets({
        undoTransactionId: 'tx-old',
      }),
    ).toEqual([{ type: 'restore_soft_deleted_transaction', transactionId: 'tx-old' }])
  })
})
