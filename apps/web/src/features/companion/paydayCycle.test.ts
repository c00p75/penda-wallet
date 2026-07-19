import { describe, expect, it } from 'vitest'
import { buildPaydayMessage, inferPaydayCadence, paydayPhase } from './paydayCycle'

describe('inferPaydayCadence', () => {
  it('infers a biweekly cadence', () => {
    const cadence = inferPaydayCadence(
      [
        { transaction_date: '2026-06-06', amount_minor: 500000 },
        { transaction_date: '2026-06-20', amount_minor: 500000 },
        { transaction_date: '2026-07-04', amount_minor: 500000 },
      ],
      { now: new Date('2026-07-10T12:00:00Z') },
    )
    expect(cadence.intervalDays).toBe(14)
    expect(cadence.lastPayday).toBe('2026-07-04')
    expect(cadence.nextPayday).toBe('2026-07-18')
  })

  it('prefers recurring next income when provided', () => {
    const cadence = inferPaydayCadence([{ transaction_date: '2026-07-01', amount_minor: 100 }], {
      now: new Date('2026-07-10T12:00:00Z'),
      recurringNextIncome: '2026-07-15',
    })
    expect(cadence.nextPayday).toBe('2026-07-15')
  })
})

describe('paydayPhase', () => {
  it('maps days relative to payday', () => {
    const now = new Date('2026-07-17T12:00:00Z')
    expect(paydayPhase('2026-07-18', now)).toBe('pre')
    expect(paydayPhase('2026-07-17', now)).toBe('day')
    expect(paydayPhase('2026-07-16', now)).toBe('post')
    expect(paydayPhase('2026-07-25', now)).toBeNull()
  })
})

describe('buildPaydayMessage', () => {
  it('builds a pre-payday shortfall message', () => {
    const msg = buildPaydayMessage({
      phase: 'pre',
      currency: 'ZMW',
      freeBeforePaydayMinor: -25000,
    })
    expect(msg.title).toBe('Payday soon')
    expect(msg.body).toMatch(/short/)
    expect(msg.chatSeed).toMatch(/payday/)
  })

  it('offers catch-up instead of allocate when day balance is gone', () => {
    const msg = buildPaydayMessage({
      phase: 'day',
      currency: 'ZMW',
      typicalAmountMinor: 500_000,
      availableBalanceMinor: -13_200,
    })
    expect(msg.body).toMatch(/spent already|catch-up/i)
    expect(msg.chatSeed).toMatch(/catch up/i)
  })

  it('offers catch-up on post-payday when balance is gone', () => {
    const msg = buildPaydayMessage({
      phase: 'post',
      currency: 'ZMW',
      availableBalanceMinor: 0,
    })
    expect(msg.body).toMatch(/spent down|catch-up/i)
  })
})
