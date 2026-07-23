import { describe, expect, it } from 'vitest'
import {
  DOMAIN_TABLES,
  buildBeforeSnapshot,
  buildReinsertRow,
  canUndoAiAction,
  filterRestorePatch,
  filterUpdatePatch,
  isUndoDomain,
} from './undoLogic'

describe('DOMAIN_TABLES sync with executePendingAction', () => {
  it('covers every AI-editable domain including wallet', () => {
    expect(Object.keys(DOMAIN_TABLES).sort()).toEqual(
      ['budget', 'category', 'debt', 'goal', 'transaction', 'wallet'].sort(),
    )
  })

  it('marks wallet non-deletable and transaction soft-deletable', () => {
    expect(DOMAIN_TABLES.wallet.deletable).toBe(false)
    expect(DOMAIN_TABLES.transaction.softDelete).toBe(true)
    expect(DOMAIN_TABLES.debt.softDelete).toBe(false)
  })

  it('update allowlists never include __before or wallet_id', () => {
    for (const cfg of Object.values(DOMAIN_TABLES)) {
      expect(cfg.updateColumns).not.toContain('__before')
      expect(cfg.updateColumns).not.toContain('wallet_id')
    }
  })
})

describe('filterUpdatePatch', () => {
  it('strips __before and unknown columns', () => {
    const patch = filterUpdatePatch('transaction', {
      amount_minor: 4500,
      __before: { amount_minor: 1200 },
      wallet_id: 'w1',
      evil: true,
    })
    expect(patch).toEqual({ amount_minor: 4500 })
  })

  it('throws on unknown domain', () => {
    expect(() => filterUpdatePatch('invoice', { name: 'x' })).toThrow(/Unknown domain/)
  })

  it.each([
    ['debt', { name: 'Loan', principal_minor: 50000, balance_minor: 1 }, { name: 'Loan', principal_minor: 50000 }],
    ['budget', { amount_minor: 100, period: 'monthly', wallet_id: 'w' }, { amount_minor: 100, period: 'monthly' }],
    ['goal', { name: 'Trip', target_amount_minor: 900 }, { name: 'Trip', target_amount_minor: 900 }],
    ['category', { name: 'Side', icon: '💼', is_system: true }, { name: 'Side', icon: '💼' }],
    ['wallet', { name: 'Home', currency: 'ZMW' }, { name: 'Home' }],
  ] as const)('%s keep only update columns', (domain, input, expected) => {
    expect(filterUpdatePatch(domain, input)).toEqual(expected)
  })

  it('returns empty when patch is null/empty', () => {
    expect(filterUpdatePatch('goal', null)).toEqual({})
    expect(filterUpdatePatch('goal', {})).toEqual({})
  })
})

describe('filterRestorePatch / buildBeforeSnapshot', () => {
  it('restores only allowlisted before fields', () => {
    expect(
      filterRestorePatch('transaction', {
        amount_minor: 1200,
        merchant: 'Shoprite',
        wallet_id: 'w1',
      }),
    ).toEqual({ amount_minor: 1200, merchant: 'Shoprite' })
  })

  it('snapshots only keys present in the forward patch', () => {
    expect(
      buildBeforeSnapshot(
        { amount_minor: 1200, merchant: 'Old', description: 'keep' },
        { amount_minor: 4500, __before: {} },
      ),
    ).toEqual({ amount_minor: 1200 })
  })
})

describe('buildReinsertRow', () => {
  it('reinserts a hard-deleted debt with ownership fields', () => {
    const row = buildReinsertRow('debt', 'd1', {
      id: 'old',
      name: 'Amara',
      direction: 'i_owe',
      counterparty: 'Amara',
      principal_minor: 20000,
      balance_minor: 20000,
      wallet_id: 'w1',
      category: { id: 'c', name: 'x' },
      deleted_at: null,
      nested: { nope: true },
      junk: 'drop-me-not-allowed',
    })
    expect(row).toEqual({
      id: 'd1',
      name: 'Amara',
      direction: 'i_owe',
      counterparty: 'Amara',
      principal_minor: 20000,
      balance_minor: 20000,
      wallet_id: 'w1',
    })
  })

  it('rejects soft-delete domains and non-deletable wallets', () => {
    expect(() => buildReinsertRow('transaction', 't1', {})).toThrow(/soft-delete/)
    expect(() => buildReinsertRow('wallet', 'w1', { name: 'Home' })).toThrow(/isn't allowed/)
  })
})

describe('canUndoAiAction', () => {
  it('allows confirmed soft-delete transactions without __before', () => {
    expect(
      canUndoAiAction({
        status: 'confirmed',
        kind: 'delete',
        domain: 'transaction',
        patch: null,
      }),
    ).toBe(true)
  })

  it('allows wallet rename undo when __before exists', () => {
    expect(
      canUndoAiAction({
        status: 'auto_applied',
        kind: 'update',
        domain: 'wallet',
        patch: { name: 'New', __before: { name: 'Old' } },
      }),
    ).toBe(true)
  })

  it.each([
    ['pending', 'update', 'goal', { __before: { name: 'a' } }, false],
    ['cancelled', 'update', 'goal', { __before: { name: 'a' } }, false],
    ['confirmed', 'update', 'goal', null, false],
    ['confirmed', 'update', 'goal', { __before: 'nope' }, false],
    ['confirmed', 'delete', 'wallet', { __before: { name: 'x' } }, false],
    ['confirmed', 'update', 'invoice', { __before: { name: 'x' } }, false],
  ] as const)('%s %s %s → %s', (status, kind, domain, patch, expected) => {
    expect(canUndoAiAction({ status, kind, domain, patch: patch as never })).toBe(expected)
  })

  it.each([
    ['confirmed', { amount: 1000000, __hasAdjustment: true }, true],
    ['confirmed', { amount: 1000000, __hasAdjustment: false }, false],
    ['confirmed', { amount: 1000000 }, false],
    ['pending', { amount: 1000000, __hasAdjustment: true }, false],
  ] as const)('reconcile %s %j → %s', (status, patch, expected) => {
    expect(
      canUndoAiAction({ status, kind: 'reconcile', domain: 'reconciliation', patch: patch as never }),
    ).toBe(expected)
  })
})

describe('isUndoDomain', () => {
  it('accepts known domains only', () => {
    expect(isUndoDomain('wallet')).toBe(true)
    expect(isUndoDomain('invoice')).toBe(false)
  })
})
