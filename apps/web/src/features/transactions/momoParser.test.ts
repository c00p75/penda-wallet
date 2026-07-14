import { describe, expect, it } from 'vitest'
import { parseMoMoText } from './momoParser'

const NOW = new Date('2026-07-14T10:00:00Z')

describe('parseMoMoText', () => {
  it('parses an Airtel Money send as an expense', () => {
    const r = parseMoMoText(
      'Txn ID PP240714.1523.C12345 Confirmed. You have sent K250.00 to JOHN MULENGA (0977123456). Fee: K5.00. Your new balance is K1,250.00.',
      { now: NOW },
    )
    expect(r).not.toBeNull()
    expect(r!.provider).toBe('airtel')
    expect(r!.type).toBe('expense')
    expect(r!.amountMinor).toBe(25000)
    expect(r!.currencyHint).toBe('ZMW')
    expect(r!.merchant).toBe('JOHN MULENGA')
    expect(r!.balanceMinor).toBe(125000)
  })

  it('parses an Airtel Money receive as income', () => {
    const r = parseMoMoText(
      'You have received K500.00 from MARY BANDA (0966555444). Your new balance is K1,750.00. Ref: RC98765.',
      { now: NOW },
    )
    expect(r!.type).toBe('income')
    expect(r!.amountMinor).toBe(50000)
    expect(r!.merchant).toBe('MARY BANDA')
    expect(r!.balanceMinor).toBe(175000)
    expect(r!.reference).toBe('RC98765')
  })

  it('parses an MTN MoMo merchant payment', () => {
    const r = parseMoMoText(
      'Payment of ZMW120.50 to SHOPRITE LUSAKA successful. Financial Transaction Id: 987654321. Your balance is ZMW900.00.',
      { now: NOW },
    )
    expect(r!.provider).toBe('mtn')
    expect(r!.type).toBe('expense')
    expect(r!.amountMinor).toBe(12050)
    expect(r!.merchant).toBe('SHOPRITE LUSAKA')
    expect(r!.balanceMinor).toBe(90000)
  })

  it('parses a bank POS debit and its transaction date', () => {
    const r = parseMoMoText(
      'Your ZANACO account xxxx1234 was debited ZMW450.00 on 12/07/2026 for POS Purchase at PICK N PAY MANDA HILL. Available balance: ZMW3,200.00.',
      { now: NOW },
    )
    expect(r!.provider).toBe('bank')
    expect(r!.type).toBe('expense')
    expect(r!.amountMinor).toBe(45000)
    expect(r!.merchant).toBe('PICK N PAY MANDA HILL')
    expect(r!.balanceMinor).toBe(320000)
    expect(r!.transactionDate).toBe('2026-07-12')
  })

  it('defaults the transaction date to today when none is present', () => {
    const r = parseMoMoText('You have received K80.00 from AIRTELMONEY.', { now: NOW })
    expect(r!.transactionDate).toBe('2026-07-14')
  })

  it('returns null for text with no financial signal', () => {
    expect(parseMoMoText('Hey, are we still on for lunch tomorrow?', { now: NOW })).toBeNull()
  })

  it('returns null when there is an amount but no direction (e.g. a balance ping)', () => {
    expect(
      parseMoMoText('Your Airtel Money balance is K1,000.00. Dial *115# for more.', { now: NOW }),
    ).toBeNull()
  })

  it('ignores the fee when picking the transacted amount', () => {
    const r = parseMoMoText(
      'You have sent K1,000.00 to ABC LTD. Fee: K15.00. New balance K200.00.',
      { now: NOW },
    )
    expect(r!.amountMinor).toBe(100000)
  })
})
