import { describe, expect, it } from 'vitest'
import {
  IMMEDIATE_LOOKUP_TOOLS,
  STAGING_TOOLS,
  TOOL_NAMES,
  inferPreferredTool,
  toolResultLooksFailed,
  validateToolArgs,
  type ToolName,
} from './toolSchemas'

const CATS = ['Food', 'Transport', 'Income', 'Transfer']

describe('tool catalog', () => {
  it('lists every chat-message tool once', () => {
    expect(TOOL_NAMES).toHaveLength(12)
    expect(new Set(TOOL_NAMES).size).toBe(12)
  })

  it('only stages update/delete', () => {
    expect([...STAGING_TOOLS].sort()).toEqual(['delete_record', 'update_record'])
    for (const name of TOOL_NAMES) {
      if (STAGING_TOOLS.has(name)) continue
      expect(STAGING_TOOLS.has(name)).toBe(false)
    }
  })

  it('marks lookup tools as immediate', () => {
    expect(IMMEDIATE_LOOKUP_TOOLS.has('query_records')).toBe(true)
    expect(IMMEDIATE_LOOKUP_TOOLS.has('get_spending_summary')).toBe(true)
    expect(IMMEDIATE_LOOKUP_TOOLS.has('create_transaction')).toBe(false)
  })
})

describe('validateToolArgs happy paths', () => {
  const ok: Array<[ToolName, Record<string, unknown>]> = [
    [
      'create_transaction',
      { type: 'expense', amount: 12.5, category: 'Food', transaction_date: '2026-07-14' },
    ],
    [
      'create_transaction',
      { type: 'income', amount: 500, category: 'Income', merchant: 'Payroll', transaction_date: '2026-07-01' },
    ],
    ['create_debt', { name: 'Loan from Amara', direction: 'i_owe', amount: 200 }],
    [
      'log_borrowed_or_lent_money',
      { direction: 'owed_to_me', amount: 50, name: 'Lent to Tich', transaction_date: '2026-07-14' },
    ],
    ['create_budget', { amount: 300, period: 'monthly', category: 'Food', rollover: true }],
    ['create_goal', { name: 'Laptop', target_amount: 8000, current_amount: 500 }],
    ['create_category', { name: 'Side hustle', icon: '💼' }],
    ['query_records', { domain: 'transaction', search: 'Shoprite', since: '2026-07-01', limit: 5 }],
    ['get_spending_summary', { since: '2026-07-01', until: '2026-07-14' }],
    ['update_record', { domain: 'goal', id: 'g1', changes: { name: 'New laptop' } }],
    ['delete_record', { domain: 'transaction', id: 't1' }],
    ['save_memory', { kind: 'preference', content: 'Hates takeout on weekdays' }],
    [
      'teach_categorization',
      { match_value: 'Uber', category: 'Transport', match_type: 'merchant_contains' },
    ],
  ]

  it.each(ok)('%s accepts valid args', (name, args) => {
    expect(validateToolArgs(name, args, { categories: CATS })).toEqual({ ok: true })
  })
})

describe('validateToolArgs reject corpus', () => {
  it.each([
    ['create_transaction', { type: 'transfer', amount: 1, category: 'Food', transaction_date: '2026-07-14' }, 'type'],
    ['create_transaction', { type: 'expense', amount: 0, category: 'Food', transaction_date: '2026-07-14' }, 'amount'],
    ['create_transaction', { type: 'expense', amount: -5, category: 'Food', transaction_date: '2026-07-14' }, 'amount'],
    ['create_transaction', { type: 'expense', amount: 1, category: 'Unknown', transaction_date: '2026-07-14' }, 'category'],
    ['create_transaction', { type: 'expense', amount: 1, category: 'Food', transaction_date: '14/07/2026' }, 'transaction_date'],
    ['create_debt', { name: '', direction: 'i_owe', amount: 10 }, 'name'],
    ['create_debt', { name: 'X', direction: 'they_owe', amount: 10 }, 'direction'],
    ['create_budget', { amount: 10, period: 'yearly' }, 'period'],
    ['create_goal', { name: 'X', target_amount: 0 }, 'target_amount'],
    ['query_records', { domain: 'wallet' }, 'domain'],
    ['get_spending_summary', { since: 'yesterday' }, 'since'],
    ['update_record', { domain: 'transaction', id: 't1', changes: {} }, 'changes'],
    ['delete_record', { domain: 'wallet', id: 'w1' }, 'domain'],
    ['save_memory', { kind: 'secret', content: 'x' }, 'kind'],
    ['teach_categorization', { match_value: 'Uber', category: 'Foodie' }, 'category'],
    ['teach_categorization', { match_value: 'Uber', category: 'Food', match_type: 'exact' }, 'match_type'],
  ] as const)('%s rejects %s', (name, args, path) => {
    const result = validateToolArgs(name, args, { categories: CATS })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.some((i) => i.path === path)).toBe(true)
  })

  it('rejects non-object args', () => {
    expect(validateToolArgs('create_goal', null).ok).toBe(false)
    expect(validateToolArgs('create_goal', 'Laptop').ok).toBe(false)
  })
})

describe('toolResultLooksFailed', () => {
  it.each([
    ['Failed to insert row', true],
    ['Amount must be positive', true],
    ['Debt amount is required', true],
    ['Budget amount too small', true],
    ['Goal target must be set', true],
    ['A category with that name exists', true],
    ['A memory could not be saved', true],
    ["I can't delete wallets", true],
    ['I need a record id first', true],
    ['Nothing to update', true],
    ['Unknown tool foobar', true],
    ['Deleting wallets is not allowed', true],
    ['Tool "create_goal" timed out', true],
    ['Logged K12.50 at Shoprite', false],
    ['Remembered that you freelance Fridays', false],
    ['', false],
  ] as const)('%s → %s', (result, failed) => {
    expect(toolResultLooksFailed(result)).toBe(failed)
  })

  it('treats thrown tools as failed regardless of body', () => {
    expect(toolResultLooksFailed('ok', true)).toBe(true)
  })
})

describe('inferPreferredTool utterance goldens', () => {
  it.each([
    ['I spent K45 at Shoprite', 'create_transaction'],
    ['Paid 20 for Uber', 'create_transaction'],
    ['Received my salary today K5500', 'create_transaction'],
    ['Log K12 lunch', 'create_transaction'],
    ['I owe Amara K200 but have not paid yet', 'create_debt'],
    ['Create an IOU for Tich K50', 'create_debt'],
    ['I borrowed K300 from Mum and got the cash', 'log_borrowed_or_lent_money'],
    ['I lent K80 to Chanda, sent via MoMo', 'log_borrowed_or_lent_money'],
    ['Set a monthly food budget of K800', 'create_budget'],
    ['Cap my transport at K200 a week', 'create_budget'],
    ['Create a savings goal for a laptop', 'create_goal'],
    ['I want to save for school fees', 'create_goal'],
    ['Add a category called Side hustle', 'create_category'],
    ['How much did I spend this week?', 'get_spending_summary'],
    ['Show my transactions at Shoprite', 'query_records'],
    ['Find the debt with Amara', 'query_records'],
    ['Rename my emergency fund goal', 'update_record'],
    ['Delete that lunch transaction', 'delete_record'],
    ['Remember that I freelance on Fridays', 'save_memory'],
    ['I prefer not to eat out on weekdays', 'save_memory'],
    ['Always categorize Uber as Transport', 'teach_categorization'],
    ['Teach Penda: Shoprite is Food', 'teach_categorization'],
    ['Hello', null],
    ['How are you?', null],
    ['', null],
  ] as const)('%s → %s', (utterance, tool) => {
    expect(inferPreferredTool(utterance)).toBe(tool)
  })
})
