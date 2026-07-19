import { describe, expect, it } from 'vitest'
import { buildPatch, categoryGuardMessage, sanitizeSearch } from './buildPatch'
import { filterUpdatePatch } from '@/features/audit/undoLogic'
import { patchIsHighImpact } from '@/features/audit/aiTrustLogic'
import { buildBeforeSnapshot } from '@/features/audit/undoLogic'

const CATS = [
  { id: 'food', name: 'Food' },
  { id: 'transport', name: 'Transport' },
]

describe('buildPatch', () => {
  it('maps decimal amounts to minor units and category names to ids', () => {
    const { patch, diffKeys } = buildPatch(
      'transaction',
      {
        amount_minor: 1000,
        type: 'expense',
        category_id: 'food',
        merchant: 'Old',
        description: null,
        transaction_date: '2026-07-01',
      },
      { amount: 45.5, category: 'Transport', merchant: 'Uber' },
      CATS,
    )
    expect(patch).toEqual({
      amount_minor: 4550,
      category_id: 'transport',
      merchant: 'Uber',
    })
    expect(diffKeys.sort()).toEqual(['amount', 'category', 'merchant'].sort())
  })

  it('drops unchanged fields and unknown keys', () => {
    const { patch } = buildPatch(
      'goal',
      { name: 'Laptop', target_amount_minor: 800000, current_amount_minor: 0, target_date: null },
      { name: 'Laptop', target_amount: 8000, wallet_id: 'nope' },
      CATS,
    )
    expect(patch).toEqual({})
  })

  it('rejects negative money and unknown categories', () => {
    expect(() =>
      buildPatch('transaction', { amount_minor: 0 }, { amount: -1 }, CATS),
    ).toThrow(/non-negative/)
    expect(() =>
      buildPatch('transaction', { category_id: null }, { category: 'NoSuch' }, CATS),
    ).toThrow(/No category/)
  })

  it('treats empty string raw fields as null', () => {
    const { patch } = buildPatch(
      'debt',
      { name: 'X', direction: 'i_owe', counterparty: 'Amara', principal_minor: 100, due_date: '2026-08-01' },
      { counterparty: '', due_date: '' },
      CATS,
    )
    expect(patch).toEqual({ counterparty: null, due_date: null })
  })

  it('round-trips with execute allowlist + high-impact detection', () => {
    const row = {
      amount_minor: 1000,
      type: 'expense',
      category_id: 'food',
      merchant: null,
      description: null,
      transaction_date: '2026-07-01',
    }
    const { patch } = buildPatch('transaction', row, { amount: 1500 }, CATS)
    const before = buildBeforeSnapshot(row, patch)
    const staged = { ...patch, __before: before }
    expect(filterUpdatePatch('transaction', staged)).toEqual({ amount_minor: 150000 })
    expect(patchIsHighImpact(patch, before)).toBe(true)
  })
})

describe('sanitizeSearch', () => {
  it.each([
    ['Shoprite (Lusaka)', 'Shoprite Lusaka'],
    ['a,b;c', 'abc'],
    ['  hello  ', 'hello'],
    [null, ''],
  ] as const)('%s → %s', (raw, expected) => {
    expect(sanitizeSearch(raw)).toBe(expected)
  })
})

describe('categoryGuardMessage', () => {
  it('blocks system and global defaults', () => {
    expect(categoryGuardMessage({ is_system: true, wallet_id: 'w1' })).toMatch(/built-in/)
    expect(categoryGuardMessage({ is_system: false, wallet_id: null })).toMatch(/built-in/)
    expect(categoryGuardMessage({ is_system: false, wallet_id: 'w1' })).toBeNull()
  })
})
