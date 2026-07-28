import { describe, expect, it } from 'vitest'
import {
  accountBalanceMinor,
  balancesByAccount,
  moneyAccountBalanceMinor,
} from './accountBalance'

describe('moneyAccountBalanceMinor', () => {
  it('sums income minus expense and ignores transfers', () => {
    const txs = [
      { type: 'income', amount_minor: 10_000, account_id: 'a' },
      { type: 'expense', amount_minor: 3_000, account_id: 'a' },
      { type: 'transfer', amount_minor: 1_000, converted_amount_minor: -1_000, account_id: 'a' },
      { type: 'transfer', amount_minor: 1_000, converted_amount_minor: 1_000, account_id: 'b' },
    ]
    expect(moneyAccountBalanceMinor(txs)).toBe(7_000)
  })
})

describe('accountBalanceMinor', () => {
  it('tracks income and expense on one pocket', () => {
    const txs = [
      { type: 'income', amount_minor: 5_000, account_id: 'cash' },
      { type: 'expense', amount_minor: 1_200, account_id: 'cash' },
      { type: 'expense', amount_minor: 500, account_id: 'airtel' },
    ]
    expect(accountBalanceMinor(txs, 'cash')).toBe(3_800)
    expect(accountBalanceMinor(txs, 'airtel')).toBe(-500)
  })

  it('applies signed transfer legs per pocket', () => {
    const txs = [
      {
        type: 'transfer',
        amount_minor: 2_000,
        converted_amount_minor: -2_000,
        account_id: 'cash',
      },
      {
        type: 'transfer',
        amount_minor: 2_000,
        converted_amount_minor: 2_000,
        account_id: 'airtel',
      },
    ]
    expect(accountBalanceMinor(txs, 'cash')).toBe(-2_000)
    expect(accountBalanceMinor(txs, 'airtel')).toBe(2_000)
    expect(moneyAccountBalanceMinor(txs)).toBe(0)
  })
})

describe('balancesByAccount', () => {
  it('returns a row per known account id', () => {
    const rows = balancesByAccount(
      [{ type: 'income', amount_minor: 100, account_id: 'a' }],
      ['a', 'b'],
    )
    expect(rows).toEqual([
      { accountId: 'a', balanceMinor: 100 },
      { accountId: 'b', balanceMinor: 0 },
    ])
  })
})
