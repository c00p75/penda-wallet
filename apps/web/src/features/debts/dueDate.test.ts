import { describe, expect, it } from 'vitest'
import { debtDueUrgency, sortDebtsByDueDate } from './dueDate'
import type { Debt } from './types'

function debt(partial: Partial<Debt> & Pick<Debt, 'id' | 'due_date' | 'balance_minor'>): Debt {
  return {
    wallet_id: 'w1',
    name: partial.name ?? partial.id,
    direction: 'i_owe',
    counterparty: null,
    principal_minor: 10000,
    interest_rate: null,
    archived_at: null,
    created_at: partial.created_at ?? '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...partial,
  }
}

describe('debtDueUrgency', () => {
  it('classifies relative to today', () => {
    expect(debtDueUrgency(debt({ id: 'a', due_date: '2026-07-10', balance_minor: 100 }), '2026-07-14')).toBe(
      'overdue',
    )
    expect(debtDueUrgency(debt({ id: 'b', due_date: '2026-07-14', balance_minor: 100 }), '2026-07-14')).toBe(
      'due_today',
    )
    expect(debtDueUrgency(debt({ id: 'c', due_date: '2026-07-16', balance_minor: 100 }), '2026-07-14')).toBe(
      'due_soon',
    )
    expect(debtDueUrgency(debt({ id: 'd', due_date: '2026-08-01', balance_minor: 100 }), '2026-07-14')).toBe(
      'none',
    )
  })

  it('ignores settled debts and missing dates', () => {
    expect(debtDueUrgency(debt({ id: 'e', due_date: '2026-07-01', balance_minor: 0 }), '2026-07-14')).toBe(
      'none',
    )
    expect(debtDueUrgency(debt({ id: 'f', due_date: null, balance_minor: 100 }), '2026-07-14')).toBe('none')
  })
})

describe('sortDebtsByDueDate', () => {
  it('puts overdue and imminent debts first', () => {
    const sorted = sortDebtsByDueDate(
      [
        debt({ id: 'later', due_date: '2026-08-01', balance_minor: 100, created_at: '2026-07-01T00:00:00Z' }),
        debt({ id: 'none', due_date: null, balance_minor: 100, created_at: '2026-07-02T00:00:00Z' }),
        debt({ id: 'overdue', due_date: '2026-07-01', balance_minor: 100, created_at: '2026-07-03T00:00:00Z' }),
        debt({ id: 'today', due_date: '2026-07-14', balance_minor: 100, created_at: '2026-07-04T00:00:00Z' }),
      ],
      '2026-07-14',
    )
    expect(sorted.map((d) => d.id)).toEqual(['overdue', 'today', 'later', 'none'])
  })
})
