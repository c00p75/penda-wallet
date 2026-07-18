import type { RecurringFrequency, RecurringTransaction } from '@/features/recurring/types'
import { addLocalDays, localDateStr, parseLocalDate } from '@/lib/dates'

export type ProjectedEventKind = 'income' | 'bill' | 'spending'

export interface ProjectedEvent {
  kind: ProjectedEventKind
  label: string
  /** Signed: income positive, bills and spending negative. */
  amountMinor: number
}

export interface ProjectedDay {
  date: string
  events: ProjectedEvent[]
  netMinor: number
  /** Running balance at the end of this day. */
  balanceMinor: number
}

export interface CashflowProjection {
  days: ProjectedDay[]
  lowestBalance: { date: string; balanceMinor: number }
  nextIncome: { date: string; amountMinor: number } | null
  /** Lowest projected balance before the next income lands (a negative value
   * signals a shortfall before payday). Null when no income is expected. */
  freeBeforeNextIncomeMinor: number | null
}

export interface ProjectCashflowInput {
  startingBalanceMinor: number
  recurring: RecurringTransaction[]
  avgDailySpendMinor: number
  from: Date
  days: number
}

function toStr(date: Date): string {
  return localDateStr(date)
}

function stepLocal(date: Date, freq: RecurringFrequency): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  switch (freq) {
    case 'daily':
      d.setDate(d.getDate() + 1)
      break
    case 'weekly':
      d.setDate(d.getDate() + 7)
      break
    case 'monthly':
      d.setMonth(d.getMonth() + 1)
      break
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1)
      break
  }
  return d
}

/**
 * Build a forward-looking, day-by-day cash projection from the current balance,
 * active recurring income/bills, and typical everyday spend. Powers the living
 * cashflow timeline: where the crunch is, and how much is free before payday.
 */
export function projectCashflow(input: ProjectCashflowInput): CashflowProjection {
  const { startingBalanceMinor, recurring, avgDailySpendMinor, from, days } = input
  const fromStr = toStr(from)
  const endStr = addLocalDays(from, days)

  // Expand recurring rules into a date -> events map within the window.
  const byDate = new Map<string, ProjectedEvent[]>()
  const GUARD = 1200
  for (const rule of recurring) {
    if (!rule.is_active) continue
    const { template, frequency } = rule
    let d = parseLocalDate(rule.next_run_date)
    let guard = 0
    while (toStr(d) < fromStr && guard < GUARD) {
      d = stepLocal(d, frequency)
      guard += 1
    }
    while (toStr(d) < endStr && guard < GUARD) {
      const dateStr = toStr(d)
      const isIncome = template.type === 'income'
      const event: ProjectedEvent = {
        kind: isIncome ? 'income' : 'bill',
        label: template.merchant || template.description || (isIncome ? 'Income' : 'Bill'),
        amountMinor: isIncome ? template.amount_minor : -template.amount_minor,
      }
      const list = byDate.get(dateStr) ?? []
      list.push(event)
      byDate.set(dateStr, list)
      d = stepLocal(d, frequency)
      guard += 1
    }
  }

  const projectedDays: ProjectedDay[] = []
  let balance = startingBalanceMinor
  for (let i = 0; i < days; i++) {
    const dateStr = addLocalDays(from, i)

    const events = [...(byDate.get(dateStr) ?? [])]
    if (avgDailySpendMinor > 0) {
      events.push({ kind: 'spending', label: 'Everyday spending', amountMinor: -avgDailySpendMinor })
    }
    const net = events.reduce((sum, e) => sum + e.amountMinor, 0)
    balance += net
    projectedDays.push({ date: dateStr, events, netMinor: net, balanceMinor: balance })
  }

  const lowestBalance = projectedDays.reduce(
    (lowest, d) => (d.balanceMinor < lowest.balanceMinor ? { date: d.date, balanceMinor: d.balanceMinor } : lowest),
    { date: projectedDays[0]?.date ?? fromStr, balanceMinor: projectedDays[0]?.balanceMinor ?? startingBalanceMinor },
  )

  let nextIncome: CashflowProjection['nextIncome'] = null
  for (const d of projectedDays) {
    const incomeMinor = d.events.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amountMinor, 0)
    if (incomeMinor > 0) {
      nextIncome = { date: d.date, amountMinor: incomeMinor }
      break
    }
  }

  let freeBeforeNextIncomeMinor: number | null = null
  if (nextIncome) {
    const before = projectedDays.filter((d) => d.date < nextIncome!.date)
    freeBeforeNextIncomeMinor = before.length
      ? Math.min(...before.map((d) => d.balanceMinor))
      : startingBalanceMinor
  }

  return { days: projectedDays, lowestBalance, nextIncome, freeBeforeNextIncomeMinor }
}
