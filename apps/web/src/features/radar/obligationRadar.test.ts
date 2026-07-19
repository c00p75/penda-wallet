import { describe, expect, it } from 'vitest'
import { buildObligationRadar, radarCoachingLine } from './obligationRadar'
import type { RecurringTransaction } from '@/features/recurring/types'

function recurring(opts: {
  id: string
  next_run_date?: string
  template?: Partial<RecurringTransaction['template']>
}): RecurringTransaction {
  return {
    id: opts.id,
    wallet_id: 'w1',
    created_by: 'u1',
    frequency: 'monthly',
    next_run_date: opts.next_run_date ?? '2026-07-20',
    last_run_date: null,
    is_active: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    template: {
      type: 'expense',
      amount_minor: 10_000,
      currency: 'ZMW',
      merchant: 'Rent',
      description: null,
      category_id: null,
      ...opts.template,
    },
  }
}

describe('buildObligationRadar', () => {
  const now = new Date('2026-07-18T12:00:00')

  it('includes bills and debts in the window', () => {
    const radar = buildObligationRadar({
      now,
      days: 14,
      recurring: [
        recurring({ id: 'r1', next_run_date: '2026-07-20' }),
        recurring({ id: 'r2', next_run_date: '2026-08-10' }),
      ],
      debts: [
        {
          id: 'd1',
          name: 'Loan',
          direction: 'i_owe',
          balance_minor: 20_000,
          due_date: '2026-07-22',
        },
      ],
    })
    expect(radar.obligations).toHaveLength(2)
    expect(radar.outflowTotalMinor).toBe(30_000)
    expect(radar.crunchDate).toBe('2026-07-20')
  })

  it('builds a coaching line when pressure is negative', () => {
    const radar = buildObligationRadar({
      now,
      recurring: [recurring({ id: 'r1' })],
    })
    expect(radarCoachingLine(radar, 'ZMW')).toMatch(/obligation/i)
  })
})
