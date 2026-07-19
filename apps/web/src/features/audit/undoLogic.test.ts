/** Canonical allowlist tests live in @penda/money-core. */
import { describe, expect, it } from 'vitest'
import { canUndoAiAction, filterUpdatePatch } from '@penda/money-core'

describe('undoLogic (web re-export)', () => {
  it('exposes wallet undo + strips __before', () => {
    expect(
      canUndoAiAction({
        status: 'confirmed',
        kind: 'update',
        domain: 'wallet',
        patch: { name: 'New', __before: { name: 'Old' } },
      }),
    ).toBe(true)
    expect(filterUpdatePatch('transaction', { amount_minor: 1, __before: {} })).toEqual({
      amount_minor: 1,
    })
  })
})