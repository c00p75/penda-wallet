import { describe, expect, it } from 'vitest'
import { parseMoMoText, type ParsedMoMo } from './momoParser'

const NOW = new Date('2026-07-14T10:00:00Z')

function parse(text: string) {
  return parseMoMoText(text, { now: NOW })
}

describe('parseMoMoText', () => {
  it('parses an Airtel Money send as an expense', () => {
    const r = parse(
      'Txn ID PP240714.1523.C12345 Confirmed. You have sent K250.00 to JOHN MULENGA (0977123456). Fee: K5.00. Your new balance is K1,250.00.',
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
    const r = parse(
      'You have received K500.00 from MARY BANDA (0966555444). Your new balance is K1,750.00. Ref: RC98765.',
    )
    expect(r!.type).toBe('income')
    expect(r!.amountMinor).toBe(50000)
    expect(r!.merchant).toBe('MARY BANDA')
    expect(r!.balanceMinor).toBe(175000)
    expect(r!.reference).toBe('RC98765')
  })

  it('parses an MTN MoMo merchant payment', () => {
    const r = parse(
      'Payment of ZMW120.50 to SHOPRITE LUSAKA successful. Financial Transaction Id: 987654321. Your balance is ZMW900.00.',
    )
    expect(r!.provider).toBe('mtn')
    expect(r!.type).toBe('expense')
    expect(r!.amountMinor).toBe(12050)
    expect(r!.merchant).toBe('SHOPRITE LUSAKA')
    expect(r!.balanceMinor).toBe(90000)
  })

  it('parses a bank POS debit and its transaction date', () => {
    const r = parse(
      'Your ZANACO account xxxx1234 was debited ZMW450.00 on 12/07/2026 for POS Purchase at PICK N PAY MANDA HILL. Available balance: ZMW3,200.00.',
    )
    expect(r!.provider).toBe('bank')
    expect(r!.type).toBe('expense')
    expect(r!.amountMinor).toBe(45000)
    expect(r!.merchant).toBe('PICK N PAY MANDA HILL')
    expect(r!.balanceMinor).toBe(320000)
    expect(r!.transactionDate).toBe('2026-07-12')
  })

  it('defaults the transaction date to today when none is present', () => {
    const r = parse('You have received K80.00 from AIRTELMONEY.')
    expect(r!.transactionDate).toBe('2026-07-14')
  })

  it('returns null for text with no financial signal', () => {
    expect(parse('Hey, are we still on for lunch tomorrow?')).toBeNull()
  })

  it('returns null when there is an amount but no direction (e.g. a balance ping)', () => {
    expect(parse('Your Airtel Money balance is K1,000.00. Dial *115# for more.')).toBeNull()
  })

  it('ignores the fee when picking the transacted amount', () => {
    const r = parse('You have sent K1,000.00 to ABC LTD. Fee: K15.00. New balance K200.00.')
    expect(r!.amountMinor).toBe(100000)
  })
})

describe('parseMoMoText provider detection', () => {
  it.each([
    ['MTN MoMo payment of ZMW50.00 to X successful.', 'mtn'],
    ['Financial Transaction Id: 1. You paid K10.00 to Y.', 'mtn'],
    ['You have sent K10.00 to BOB. Txn ID PP123.', 'airtel'],
    ['Airtel Money: You paid K20.00 to SHOP.', 'airtel'],
    ['Zamtel Kwacha Link: You sent K30.00 to ANN.', 'zamtel'],
    ['Your FNB account was debited ZMW40.00 for POS Purchase at SPAR.', 'bank'],
    ['Stanbic: Account debited ZMW55.00 for purchase at TOTAL.', 'bank'],
    ['ABSA account xxxx was debited ZMW60.00 at GAME.', 'bank'],
    ['Standard Chartered: You paid ZMW70.00 to MERCHANT.', 'bank'],
    ['Indo-Zambia Bank: Account debited ZMW80.00 for purchase at FOOD LOVERS.', 'bank'],
    ['Zambia National Commercial Bank debited ZMW90.00 for purchase at CHOPPIES.', 'bank'],
    ['You sent K5.00 to FRIEND. Confirmed.', 'unknown'],
  ] as const)('%s → %s', (text, provider) => {
    expect(parse(text)!.provider).toBe(provider)
  })
})

describe('parseMoMoText direction vocabulary', () => {
  it.each([
    ['You have sent K100.00 to A.', 'expense'],
    ['Payment of K100.00 to A successful.', 'expense'],
    ['You paid K100.00 to A.', 'expense'],
    ['Account was debited K100.00 for purchase at A.', 'expense'],
    ['Purchase of K100.00 at A successful.', 'expense'],
    ['You withdrew K100.00 from agent A.', 'expense'],
    ['Cash withdrawn K100.00. Fee K2.', 'expense'],
    ['You bought K100.00 airtime.', 'expense'],
    ['K100.00 was deducted for subscription.', 'expense'],
    ['You have received K100.00 from A.', 'income'],
    ['Account credited K100.00 from payroll.', 'income'],
    ['Deposit of K100.00 successful.', 'income'],
    ['K100.00 deposited to your wallet.', 'income'],
    ['Refund of K100.00 credited.', 'income'],
    ['Cash in of K100.00 successful.', 'income'],
    ['Cashin K100.00 completed.', 'income'],
  ] as const)('%s → %s', (text, type) => {
    expect(parse(text)!.type).toBe(type)
    expect(parse(text)!.amountMinor).toBe(10000)
  })

  it('treats ambiguous messages that match both directions as expense when send/paid wins', () => {
    // "payment" + "received" both match; expense path wins when isExpense is true.
    const r = parse('Payment received K100.00 from CLIENT. You paid agent fee separately.')
    expect(r).not.toBeNull()
    expect(r!.type).toBe('expense')
  })
})

describe('parseMoMoText amount & currency edge cases', () => {
  it.each([
    ['You sent K1 to A.', 100, 'ZMW'],
    ['You sent K1.5 to A.', 150, 'ZMW'],
    ['You sent K1.50 to A.', 150, 'ZMW'],
    ['You sent K1,250 to A.', 125000, 'ZMW'],
    ['You sent K1,250.99 to A.', 125099, 'ZMW'],
    ['You sent ZMW 450 to A.', 45000, 'ZMW'],
    ['You sent ZMW450.00 to A.', 45000, 'ZMW'],
    ['You sent $20.50 to A.', 2050, 'USD'],
    ['You sent USD 20 to A.', 2000, 'USD'],
    ['You received USD99.99 from B.', 9999, 'USD'],
  ] as const)('%s → minor=%i currency=%s', (text, minor, currency) => {
    const r = parse(text)!
    expect(r.amountMinor).toBe(minor)
    expect(r.currencyHint).toBe(currency)
  })

  it('does not treat mid-word K as currency (e.g. OK)', () => {
    // Without lookbehind, "OK" could falsely yield a currency match; still need a real amount.
    const r = parse('OK you sent K50.00 to BOB.')
    expect(r!.amountMinor).toBe(5000)
  })

  it('skips fee amounts and still finds the principal later', () => {
    const r = parse('Fee: K5.00. You have sent K250.00 to JOHN. Balance K900.00.')
    expect(r!.amountMinor).toBe(25000)
    expect(r!.balanceMinor).toBe(90000)
  })

  it('skips bal/balance-prefixed amounts when picking principal', () => {
    const r = parse('Available bal K500.00. You paid K40.00 to SPAR.')
    expect(r!.amountMinor).toBe(4000)
    expect(r!.balanceMinor).toBe(50000)
  })

  it('uses the first non-fee, non-balance amount as principal when several appear', () => {
    const r = parse('You sent K200.00 to A and K50.00 tip noted. New balance K10.00.')
    expect(r!.amountMinor).toBe(20000)
  })
})

describe('parseMoMoText merchant extraction', () => {
  it.each([
    ['You have sent K10.00 to JOHN MULENGA (0977).', 'JOHN MULENGA'],
    ['You have received K10.00 from MARY BANDA.', 'MARY BANDA'],
    ['Payment of K10.00 to SHOPRITE LUSAKA successful.', 'SHOPRITE LUSAKA'],
    ['Debited K10.00 for POS Purchase at PICK N PAY.', 'PICK N PAY'],
    ['You paid K10.00 to ABC LTD for groceries.', 'ABC LTD'],
    ['You sent K10.00 to FRIEND. Your new balance is K1.', 'FRIEND'],
    ['You sent K10.00 to X. Fee K1. Balance K2.', 'X'],
    ['You sent K10.00 to Y Ref ABC.', 'Y'],
  ] as const)('%s → %s', (text, merchant) => {
    expect(parse(text)!.merchant).toBe(merchant)
  })

  it('returns null merchant when no to/from/at clause', () => {
    expect(parse('You withdrew K100.00 successfully.')!.merchant).toBeNull()
  })

  it('collapses internal whitespace in merchant names', () => {
    expect(parse('You sent K10.00 to JOHN   MULENGA.')!.merchant).toBe('JOHN MULENGA')
  })
})

describe('parseMoMoText reference extraction', () => {
  it.each([
    ['You received K10.00 from A. Ref: RC98765.', 'RC98765'],
    ['You received K10.00 from A. Reference: AB-12.34', 'AB-12.34'],
    ['Payment of K10.00 to A. Txn ID: TXN999.', 'TXN999'],
    ['Payment of K10.00 to A. Financial Transaction Id: 987654321.', '987654321'],
    ['You sent K10.00 to A. ref. zz.1-', 'zz.1'],
  ] as const)('%s → %s', (text, ref) => {
    expect(parse(text)!.reference).toBe(ref)
  })

  it('returns null when no reference token is present', () => {
    expect(parse('You sent K10.00 to A.')!.reference).toBeNull()
  })
})

describe('parseMoMoText dates', () => {
  it.each([
    ['Your account was debited ZMW10.00 on 01/01/2026 for purchase at X.', '2026-01-01'],
    ['Your account was debited ZMW10.00 on 12-07-2026 for purchase at X.', '2026-07-12'],
    ['Your account was debited ZMW10.00 on 9/7/2026 for purchase at X.', '2026-07-09'],
  ] as const)('%s → %s', (text, date) => {
    expect(parse(text)!.transactionDate).toBe(date)
  })
})

describe('parseMoMoText reject / null corpus', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'whitespace'],
    ['Dial *115# for menu', 'ussd promo'],
    ['Your OTP is 123456', 'otp'],
    ['Meeting at 3pm about the K budget', 'no amount+direction'],
    ['Balance is K1,000.00', 'balance only'],
    ['Fee: K5.00. Available balance K100.00.', 'fee+bal only'],
    ['Congratulations! You won K1000 airtime promo', 'promo without direction verb'],
    ['Sent from my iPhone', 'direction verb without amount'],
    ['Received with thanks', 'direction verb without amount'],
  ] as const)('rejects: %s (%s)', (text, _label) => {
    expect(parse(text)).toBeNull()
  })
})

describe('parseMoMoText realistic Zambia SMS corpus', () => {
  const cases: Array<{ name: string; text: string; expect: Partial<ParsedMoMo> }> = [
    {
      name: 'MTN pay bill',
      text: 'MTN MoMo: Payment of ZMW85.00 to ZESCO successful. Financial Transaction Id: 1122334455. New balance: ZMW412.30.',
      expect: {
        provider: 'mtn',
        type: 'expense',
        amountMinor: 8500,
        merchant: 'ZESCO',
        balanceMinor: 41230,
        reference: '1122334455',
      },
    },
    {
      name: 'Airtel cash-out',
      text: 'You have withdrawn K200.00 from agent GRACE PHIRI. Fee: K4.00. Your new Airtel Money balance is K56.00. Txn ID PP240701.A1.',
      expect: {
        provider: 'airtel',
        type: 'expense',
        amountMinor: 20000,
        merchant: 'agent GRACE PHIRI',
        balanceMinor: 5600,
      },
    },
    {
      name: 'Salary credit bank',
      text: 'ZANACO: Your account was credited ZMW5,500.00 on 25/06/2026. Available balance: ZMW6,100.00. Ref: SAL-JUN26.',
      expect: {
        provider: 'bank',
        type: 'income',
        amountMinor: 550000,
        balanceMinor: 610000,
        transactionDate: '2026-06-25',
        reference: 'SAL-JUN26',
      },
    },
    {
      name: 'USD remittance',
      text: 'You have received USD150.00 from DIASPORA UNCLE. Your new balance is K3,800.00.',
      expect: {
        type: 'income',
        amountMinor: 15000,
        currencyHint: 'USD',
        merchant: 'DIASPORA UNCLE',
      },
    },
    {
      name: 'Refund',
      text: 'Refund of ZMW30.00 credited to your MoMo wallet. Financial Transaction Id: R99.',
      expect: {
        provider: 'mtn',
        type: 'income',
        amountMinor: 3000,
        reference: 'R99',
      },
    },
    {
      name: 'Zamtel send',
      text: 'Zamtel: You sent K75.00 to TWAMBO. New kwacha link balance K220.00.',
      expect: {
        provider: 'zamtel',
        type: 'expense',
        amountMinor: 7500,
        merchant: 'TWAMBO',
        balanceMinor: 22000,
      },
    },
  ]

  it.each(cases)('$name', ({ text, expect: partial }) => {
    expect(parse(text)).toMatchObject(partial)
  })
})
