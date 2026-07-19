import { describe, expect, it } from 'vitest'
import { detectCoachingInsights } from './detectCoachingInsights'
import type { Transaction } from '@/features/transactions/types'
import type { Category } from '@/features/categories/types'
import type { Budget } from '@/features/budgets/types'
import type { SavingsGoal } from '@/features/goals/types'

const NOW = new Date('2026-07-15T10:00:00Z')

function cat(id: string, name: string, icon: string | null = null): Category {
  return { id, name, icon } as Category
}

let seq = 0
function tx(over: Partial<Transaction> & { amount_minor: number; transaction_date: string }): Transaction {
  seq += 1
  return {
    id: `tx-${seq}`,
    wallet_id: 'w1',
    created_by: 'u1',
    category_id: over.category?.id ?? over.category_id ?? null,
    currency: 'ZMW',
    type: 'expense',
    merchant: null,
    description: null,
    source: 'manual',
    receipt_storage_path: null,
    ai_extraction: null,
    user_confirmed: true,
    version: 1,
    deleted_at: null,
    created_at: over.transaction_date,
    updated_at: over.transaction_date,
    category: null,
    ...over,
  } as Transaction
}

function goal(over: Partial<SavingsGoal> & { target_amount_minor: number; current_amount_minor: number }): SavingsGoal {
  return {
    id: 'g1',
    wallet_id: 'w1',
    name: 'Emergency fund',
    icon: null,
    target_date: null,
    motivation: null,
    created_at: '',
    updated_at: '',
    ...over,
  } as SavingsGoal
}

const DATA = cat('data', 'Data & Airtime', '📱')

describe('detectCoachingInsights', () => {
  it('spots an underspend opportunity and points it at a goal', () => {
    const txns = [
      // Opening cash so park/stash has headroom
      tx({ type: 'income', amount_minor: 200000, transaction_date: '2026-06-01' }),
      // ~K210/week baseline over the prior 4 weeks
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-15' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-22' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-29' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-07-06' }),
      // this week: only K100
      tx({ category: DATA, amount_minor: 10000, transaction_date: '2026-07-13' }),
    ]
    const insights = detectCoachingInsights({
      transactions: txns,
      budgets: [],
      goals: [goal({ target_amount_minor: 500000, current_amount_minor: 100000 })],
      currency: 'ZMW',
      now: NOW,
    })
    const opp = insights.find((i) => i.kind === 'opportunity')
    expect(opp).toBeTruthy()
    expect(opp!.amountMinor).toBe(11000)
    expect(opp!.action).toMatchObject({ kind: 'fund-goal' })
    // opportunity outranks the observability nudge from the same data
    expect(insights[0].kind).toBe('opportunity')
  })

  it('nudges to budget an unbudgeted category', () => {
    const txns = [
      tx({ category: DATA, amount_minor: 20000, transaction_date: '2026-05-01' }),
      tx({ category: DATA, amount_minor: 20000, transaction_date: '2026-06-01' }),
      tx({ category: DATA, amount_minor: 20000, transaction_date: '2026-07-01' }),
    ]
    const obs = detectCoachingInsights({
      transactions: txns,
      budgets: [],
      goals: [],
      currency: 'ZMW',
      now: NOW,
    }).find((i) => i.kind === 'observability')

    expect(obs).toBeTruthy()
    expect(obs!.action).toMatchObject({ kind: 'create-budget', categoryId: 'data' })
  })

  it('does not nudge a category that already has a budget', () => {
    const txns = [
      tx({ category: DATA, amount_minor: 20000, transaction_date: '2026-05-01' }),
      tx({ category: DATA, amount_minor: 20000, transaction_date: '2026-07-01' }),
    ]
    const budgets = [{ id: 'b1', category_id: 'data', amount_minor: 30000, period: 'monthly' } as Budget]
    const insights = detectCoachingInsights({ transactions: txns, budgets, goals: [], currency: 'ZMW', now: NOW })
    expect(insights.find((i) => i.kind === 'observability')).toBeUndefined()
  })

  it('celebrates a goal that is nearly funded', () => {
    const insights = detectCoachingInsights({
      transactions: [],
      budgets: [],
      goals: [goal({ name: 'New laptop', target_amount_minor: 100000, current_amount_minor: 90000 })],
      currency: 'ZMW',
      now: NOW,
    })
    const celebration = insights.find((i) => i.kind === 'celebration')
    expect(celebration).toBeTruthy()
    expect(celebration!.text).toContain('New laptop')
  })

  it('stays quiet when nothing is noteworthy', () => {
    const insights = detectCoachingInsights({
      transactions: [tx({ category: DATA, amount_minor: 500, transaction_date: '2026-07-14' })],
      budgets: [],
      goals: [],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights).toEqual([])
  })

  it('underspend without a goal still offers a stash opportunity', () => {
    const txns = [
      tx({ type: 'income', amount_minor: 200000, transaction_date: '2026-06-01' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-15' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-22' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-29' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-07-06' }),
      tx({ category: DATA, amount_minor: 10000, transaction_date: '2026-07-13' }),
    ]
    const insights = detectCoachingInsights({
      transactions: txns,
      budgets: [],
      goals: [],
      currency: 'ZMW',
      now: NOW,
    })
    const opp = insights.find((i) => i.kind === 'opportunity')
    expect(opp?.action).toMatchObject({ kind: 'view-goals' })
    expect(opp?.text).toMatch(/stash/i)
  })

  it('does not suggest parking underspend when balance is negative', () => {
    const txns = [
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-15' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-22' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-29' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-07-06' }),
      tx({ category: DATA, amount_minor: 10000, transaction_date: '2026-07-13' }),
    ]
    const insights = detectCoachingInsights({
      transactions: txns,
      budgets: [],
      goals: [goal({ target_amount_minor: 500000, current_amount_minor: 100000 })],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights.find((i) => i.kind === 'opportunity')).toBeUndefined()
  })

  it('caps parkable underspend to available balance', () => {
    const txns = [
      tx({ type: 'income', amount_minor: 200_000, transaction_date: '2026-06-01' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-15' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-22' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-29' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-07-06' }),
      tx({ category: DATA, amount_minor: 10000, transaction_date: '2026-07-13' }),
    ]
    const insights = detectCoachingInsights({
      transactions: txns,
      budgets: [],
      goals: [goal({ target_amount_minor: 500000, current_amount_minor: 100000 })],
      currency: 'ZMW',
      now: NOW,
      availableBalanceMinor: 8_000,
    })
    const opp = insights.find((i) => i.kind === 'opportunity')
    expect(opp?.amountMinor).toBe(8_000)
  })

  it('does not fire underspend when baseline is too small', () => {
    const txns = [
      tx({ category: DATA, amount_minor: 1000, transaction_date: '2026-06-15' }),
      tx({ category: DATA, amount_minor: 1000, transaction_date: '2026-06-22' }),
      tx({ category: DATA, amount_minor: 1000, transaction_date: '2026-06-29' }),
      tx({ category: DATA, amount_minor: 1000, transaction_date: '2026-07-06' }),
      tx({ category: DATA, amount_minor: 100, transaction_date: '2026-07-13' }),
    ]
    const insights = detectCoachingInsights({
      transactions: txns,
      budgets: [],
      goals: [goal({ target_amount_minor: 500000, current_amount_minor: 0 })],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights.find((i) => i.kind === 'opportunity')).toBeUndefined()
  })

  it('celebrates a fully funded goal', () => {
    const insights = detectCoachingInsights({
      transactions: [],
      budgets: [],
      goals: [goal({ name: 'Done', target_amount_minor: 100000, current_amount_minor: 100000 })],
      currency: 'ZMW',
      now: NOW,
    })
    const celebration = insights.find((i) => i.kind === 'celebration')
    expect(celebration?.text).toMatch(/fully funded/i)
    expect(celebration?.amountMinor).toBe(0)
  })

  it('ignores goals below 80% funded for celebration', () => {
    const insights = detectCoachingInsights({
      transactions: [],
      budgets: [],
      goals: [goal({ target_amount_minor: 100000, current_amount_minor: 79000 })],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights.find((i) => i.kind === 'celebration')).toBeUndefined()
  })

  it('ranks attention/opportunity above observability', () => {
    const txns = [
      tx({ type: 'income', amount_minor: 200000, transaction_date: '2026-06-01' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-15' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-22' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-06-29' }),
      tx({ category: DATA, amount_minor: 21000, transaction_date: '2026-07-06' }),
      tx({ category: DATA, amount_minor: 10000, transaction_date: '2026-07-13' }),
    ]
    const insights = detectCoachingInsights({
      transactions: txns,
      budgets: [],
      goals: [goal({ target_amount_minor: 500000, current_amount_minor: 100000 })],
      currency: 'ZMW',
      now: NOW,
    })
    expect(insights[0]?.kind).toBe('opportunity')
  })
})
