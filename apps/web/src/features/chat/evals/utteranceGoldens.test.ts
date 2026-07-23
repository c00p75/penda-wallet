import { describe, expect, it } from 'vitest'
import {
  inferPreferredTool,
  validateToolArgs,
  type ToolName,
} from './toolSchemas'

/**
 * End-to-end offline goldens: user said X → preferred tool Y with args Z.
 * Args are what a well-behaved model should emit; validated against schemas.
 */
type Golden = {
  id: string
  utterance: string
  tool: ToolName
  args: Record<string, unknown>
}

const CATS = [
  'Food',
  'Transport',
  'Groceries',
  'Income',
  'Transfer',
  'Bills',
  'Entertainment',
]

const GOLDENS: Golden[] = [
  {
    id: 'tx-shoprite',
    utterance: 'I spent K45.50 at Shoprite yesterday',
    tool: 'create_transaction',
    args: {
      type: 'expense',
      amount: 45.5,
      category: 'Groceries',
      merchant: 'Shoprite',
      transaction_date: '2026-07-13',
    },
  },
  {
    id: 'tx-uber',
    utterance: 'Paid 28 for Uber to work',
    tool: 'create_transaction',
    args: {
      type: 'expense',
      amount: 28,
      category: 'Transport',
      merchant: 'Uber',
      description: 'to work',
      transaction_date: '2026-07-14',
    },
  },
  {
    id: 'tx-salary',
    utterance: 'Got paid K5,500 today',
    tool: 'create_transaction',
    args: {
      type: 'income',
      amount: 5500,
      category: 'Income',
      merchant: 'Payroll',
      transaction_date: '2026-07-14',
    },
  },
  {
    id: 'tx-airtime',
    utterance: 'Bought K20 airtime',
    tool: 'create_transaction',
    args: {
      type: 'expense',
      amount: 20,
      category: 'Bills',
      description: 'airtime',
      transaction_date: '2026-07-14',
    },
  },
  {
    id: 'debt-promise',
    utterance: 'I owe Amara K200, due next Friday, no cash moved yet',
    tool: 'create_debt',
    args: {
      name: 'Loan from Amara',
      direction: 'i_owe',
      amount: 200,
      counterparty: 'Amara',
      due_date: '2026-07-18',
    },
  },
  {
    id: 'debt-owed-to-me-promise',
    utterance: 'Tich owes me K80 but has not paid',
    tool: 'create_debt',
    args: {
      name: 'Tich owes me',
      direction: 'owed_to_me',
      amount: 80,
      counterparty: 'Tich',
    },
  },
  {
    id: 'loan-borrowed-cash',
    utterance: 'I borrowed K300 from Mum and she sent it on MoMo',
    tool: 'log_borrowed_or_lent_money',
    args: {
      direction: 'i_owe',
      amount: 300,
      name: 'Loan from Mum',
      counterparty: 'Mum',
      category: 'Transfer',
      transaction_date: '2026-07-14',
    },
  },
  {
    id: 'loan-lent-cash',
    utterance: 'I lent K80 to Chanda, sent via Airtel',
    tool: 'log_borrowed_or_lent_money',
    args: {
      direction: 'owed_to_me',
      amount: 80,
      name: 'Lent to Chanda',
      counterparty: 'Chanda',
      category: 'Transfer',
      transaction_date: '2026-07-14',
    },
  },
  {
    id: 'debt-settle-full',
    utterance: 'Settle the Jumo loan',
    tool: 'log_debt_payment',
    args: { id: 'debt-jumo' },
  },
  {
    id: 'debt-partial-payment',
    utterance: 'I paid K200 toward the loan from Amara',
    tool: 'log_debt_payment',
    args: { id: 'debt-amara', amount: 200 },
  },
  {
    id: 'budget-food',
    utterance: 'Set a monthly food budget of K800 with rollover',
    tool: 'create_budget',
    args: { amount: 800, period: 'monthly', category: 'Food', rollover: true },
  },
  {
    id: 'budget-weekly-transport',
    utterance: 'Cap my transport at K200 a week',
    tool: 'create_budget',
    args: { amount: 200, period: 'weekly', category: 'Transport' },
  },
  {
    id: 'goal-laptop',
    utterance: 'Create a savings goal for a laptop, target K8,000, I have K500',
    tool: 'create_goal',
    args: {
      name: 'Laptop',
      target_amount: 8000,
      current_amount: 500,
      target_date: '2026-12-31',
    },
  },
  {
    id: 'goal-school',
    utterance: 'I want to save for school fees',
    tool: 'create_goal',
    args: { name: 'School fees', target_amount: 3000 },
  },
  {
    id: 'category-side',
    utterance: 'Add a category called Side hustle',
    tool: 'create_category',
    args: { name: 'Side hustle', icon: '💼' },
  },
  {
    id: 'query-shoprite',
    utterance: 'Show my Shoprite transactions this month',
    tool: 'query_records',
    args: {
      domain: 'transaction',
      search: 'Shoprite',
      since: '2026-07-01',
      until: '2026-07-31',
      limit: 20,
    },
  },
  {
    id: 'query-debts',
    utterance: 'List my debts',
    tool: 'query_records',
    args: { domain: 'debt', limit: 10 },
  },
  {
    id: 'summary-week',
    utterance: 'How much did I spend this week?',
    tool: 'get_spending_summary',
    args: { since: '2026-07-08', until: '2026-07-14' },
  },
  {
    id: 'update-goal-name',
    utterance: 'Rename my emergency fund goal to Rainy day',
    tool: 'update_record',
    args: { domain: 'goal', id: 'goal-emergency', changes: { name: 'Rainy day' } },
  },
  {
    id: 'update-tx-category',
    utterance: 'Change that lunch transaction category to Food',
    tool: 'update_record',
    args: { domain: 'transaction', id: 'tx-lunch', changes: { category: 'Food' } },
  },
  {
    id: 'delete-tx',
    utterance: 'Delete that duplicate Uber transaction',
    tool: 'delete_record',
    args: { domain: 'transaction', id: 'tx-uber-dup' },
  },
  {
    id: 'memory-freelance',
    utterance: 'Remember that I freelance on Fridays',
    tool: 'save_memory',
    args: { kind: 'fact', content: 'Freelances on Fridays' },
  },
  {
    id: 'memory-preference',
    utterance: 'I prefer not to eat out on weekdays',
    tool: 'save_memory',
    args: { kind: 'preference', content: 'Avoids eating out on weekdays' },
  },
  {
    id: 'memory-mood',
    utterance: 'Remember I stress-buy after work',
    tool: 'save_memory',
    args: { kind: 'mood', content: 'Stress-buys after work', mood: 'stressed' },
  },
  {
    id: 'teach-uber',
    utterance: 'Always categorize Uber as Transport',
    tool: 'teach_categorization',
    args: {
      match_value: 'Uber',
      category: 'Transport',
      match_type: 'merchant_contains',
    },
  },
  {
    id: 'teach-shoprite',
    utterance: 'Teach Penda Shoprite is Groceries',
    tool: 'teach_categorization',
    args: {
      match_value: 'Shoprite',
      category: 'Groceries',
      match_type: 'merchant_contains',
    },
  },
  // Adversarial / easy-to-get-wrong cases
  {
    id: 'loan-not-plain-tx',
    utterance: 'Mum gave me K300 as a loan, cash in hand',
    tool: 'log_borrowed_or_lent_money',
    args: {
      direction: 'i_owe',
      amount: 300,
      name: 'Loan from Mum',
      counterparty: 'Mum',
      transaction_date: '2026-07-14',
    },
  },
  {
    id: 'debt-not-loan-tool',
    utterance: 'Note that I owe the landlord K500 next month, nothing paid yet',
    tool: 'create_debt',
    args: {
      name: 'Landlord rent shortfall',
      direction: 'i_owe',
      amount: 500,
      counterparty: 'Landlord',
      due_date: '2026-08-01',
    },
  },
  {
    id: 'tx-usd',
    utterance: 'Spent $12.99 on Netflix',
    tool: 'create_transaction',
    args: {
      type: 'expense',
      amount: 12.99,
      category: 'Entertainment',
      merchant: 'Netflix',
      transaction_date: '2026-07-14',
    },
  },
  {
    id: 'summary-month',
    utterance: 'What was my total spend last month?',
    tool: 'get_spending_summary',
    args: { since: '2026-06-01', until: '2026-06-30' },
  },
]

describe('utterance → tool → args goldens', () => {
  it.each(GOLDENS)('$id', ({ utterance, tool, args }) => {
    expect(inferPreferredTool(utterance)).toBe(tool)
    expect(validateToolArgs(tool, args, { categories: CATS })).toEqual({ ok: true })
  })

  it('covers every tool at least once', () => {
    const covered = new Set(GOLDENS.map((g) => g.tool))
    for (const name of [
      'create_transaction',
      'create_debt',
      'log_borrowed_or_lent_money',
      'log_debt_payment',
      'create_budget',
      'create_goal',
      'create_category',
      'query_records',
      'get_spending_summary',
      'update_record',
      'delete_record',
      'save_memory',
      'teach_categorization',
    ] as ToolName[]) {
      expect(covered.has(name)).toBe(true)
    }
  })
})

describe('loan vs debt vs plain transaction decision table', () => {
  it.each([
    ['I spent K50 on lunch', 'create_transaction'],
    ['I owe K50 for lunch I already paid for', 'create_transaction'],
    ['I owe K50 to Amara, unpaid', 'create_debt'],
    ['Amara sent me K50 as a loan', 'log_borrowed_or_lent_money'],
    ['I sent K50 to Amara as a loan', 'log_borrowed_or_lent_money'],
  ] as const)('%s → %s', (utterance, tool) => {
    expect(inferPreferredTool(utterance)).toBe(tool)
  })
})
