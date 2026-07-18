import { describe, expect, it } from 'vitest'
import { projectCashflow } from './projection'
import type { RecurringTransaction, RecurringTemplate } from '@/features/recurring/types'

// Local midnight Jul 14 — projection uses local calendar days, not UTC.
const FROM = new Date(2026, 6, 14)

function tpl(over: Partial<RecurringTemplate>): RecurringTemplate {
  return {
    category_id: null,
    amount_minor: 0,
    currency: 'ZMW',
    type: 'expense',
    merchant: null,
    description: null,
    ...over,
  }
}

let seq = 0
function rec(over: Partial<RecurringTransaction> & { template: RecurringTemplate; next_run_date: string }): RecurringTransaction {
  seq += 1
  return {
    id: `r-${seq}`,
    wallet_id: 'w1',
    created_by: 'u1',
    frequency: 'monthly',
    last_run_date: null,
    is_active: true,
    created_at: FROM.toISOString(),
    updated_at: FROM.toISOString(),
    ...over,
  }
}

describe('projectCashflow', () => {
  const salary = rec({
    template: tpl({ type: 'income', amount_minor: 300000, merchant: 'Salary' }),
    frequency: 'monthly',
    next_run_date: '2026-07-20',
  })
  const rent = rec({
    template: tpl({ type: 'expense', amount_minor: 150000, merchant: 'Rent' }),
    frequency: 'monthly',
    next_run_date: '2026-07-16',
  })

  it('projects a running balance across recurring events and everyday spend', () => {
    const p = projectCashflow({
      startingBalanceMinor: 100000,
      recurring: [salary, rent],
      avgDailySpendMinor: 5000,
      from: FROM,
      days: 14,
    })

    expect(p.days).toHaveLength(14)
    expect(p.days[0].date).toBe('2026-07-14')
    // day 1: only everyday spend
    expect(p.days[0].balanceMinor).toBe(95000)

    // rent lands on the 16th as a bill event
    const rentDay = p.days.find((d) => d.date === '2026-07-16')!
    expect(rentDay.events.some((e) => e.kind === 'bill' && e.amountMinor === -150000)).toBe(true)

    // salary lands on the 20th
    const payday = p.days.find((d) => d.date === '2026-07-20')!
    expect(payday.events.some((e) => e.kind === 'income' && e.amountMinor === 300000)).toBe(true)

    // the crunch is the day before payday
    expect(p.lowestBalance).toEqual({ date: '2026-07-19', balanceMinor: -80000 })
    expect(p.nextIncome).toEqual({ date: '2026-07-20', amountMinor: 300000 })
    // buffer before payday is the lowest pre-income balance (negative = shortfall)
    expect(p.freeBeforeNextIncomeMinor).toBe(-80000)
  })

  it('rolls a monthly bill whose next run is in the past forward into the window', () => {
    const staleRent = rec({
      template: tpl({ type: 'expense', amount_minor: 150000, merchant: 'Rent' }),
      frequency: 'monthly',
      next_run_date: '2026-05-16',
    })
    const p = projectCashflow({
      startingBalanceMinor: 500000,
      recurring: [staleRent],
      avgDailySpendMinor: 0,
      from: FROM,
      days: 14,
    })
    expect(p.days.find((d) => d.date === '2026-07-16')!.events.some((e) => e.kind === 'bill')).toBe(true)
  })

  it('reports no next income when nothing comes in', () => {
    const p = projectCashflow({
      startingBalanceMinor: 50000,
      recurring: [],
      avgDailySpendMinor: 5000,
      from: FROM,
      days: 5,
    })
    expect(p.nextIncome).toBeNull()
    expect(p.freeBeforeNextIncomeMinor).toBeNull()
    expect(p.days[4].balanceMinor).toBe(25000)
    expect(p.lowestBalance).toEqual({ date: '2026-07-18', balanceMinor: 25000 })
  })

  it('skips inactive recurring rules', () => {
    const p = projectCashflow({
      startingBalanceMinor: 100000,
      recurring: [{ ...rent, is_active: false }],
      avgDailySpendMinor: 0,
      from: FROM,
      days: 14,
    })
    expect(p.days.every((d) => d.events.length === 0)).toBe(true)
  })
})
