import { addLocalDays, localDateStr } from '@/lib/dates'
import type { RecurringTransaction } from '@/features/recurring/types'

export type ObligationKind = 'bill' | 'debt' | 'income'

export interface Obligation {
  id: string
  kind: ObligationKind
  label: string
  date: string
  amountMinor: number
  /** True when this is an outflow. */
  isOutflow: boolean
}

export interface DebtDueLike {
  id: string
  name: string
  direction: 'i_owe' | 'owed_to_me'
  balance_minor: number
  due_date: string | null
}

export interface ObligationRadar {
  windowStart: string
  windowEnd: string
  obligations: Obligation[]
  outflowTotalMinor: number
  incomeTotalMinor: number
  netPressureMinor: number
  crunchDate: string | null
}

/**
 * Next N days of bills (recurring expenses), due debts, and expected income.
 */
export function buildObligationRadar(input: {
  recurring: RecurringTransaction[]
  debts?: DebtDueLike[]
  days?: number
  now?: Date
}): ObligationRadar {
  const now = input.now ?? new Date()
  const days = input.days ?? 14
  const windowStart = localDateStr(now)
  const windowEnd = addLocalDays(now, days)
  const obligations: Obligation[] = []

  for (const r of input.recurring) {
    if (!r.is_active) continue
    const date = r.next_run_date
    if (date < windowStart || date > windowEnd) continue
    const amount = Math.abs(r.template.amount_minor ?? 0)
    const isIncome = r.template.type === 'income'
    obligations.push({
      id: `recurring:${r.id}`,
      kind: isIncome ? 'income' : 'bill',
      label: r.template.merchant || r.template.description || (isIncome ? 'Income' : 'Bill'),
      date,
      amountMinor: amount,
      isOutflow: !isIncome,
    })
  }

  for (const d of input.debts ?? []) {
    if (!d.due_date || d.balance_minor <= 0) continue
    if (d.due_date < windowStart || d.due_date > windowEnd) continue
    const iOwe = d.direction === 'i_owe'
    obligations.push({
      id: `debt:${d.id}`,
      kind: 'debt',
      label: d.name,
      date: d.due_date,
      amountMinor: d.balance_minor,
      isOutflow: iOwe,
    })
  }

  obligations.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label))

  let outflowTotalMinor = 0
  let incomeTotalMinor = 0
  for (const o of obligations) {
    if (o.isOutflow) outflowTotalMinor += o.amountMinor
    else incomeTotalMinor += o.amountMinor
  }

  const crunch = obligations.find((o) => o.isOutflow)

  return {
    windowStart,
    windowEnd,
    obligations,
    outflowTotalMinor,
    incomeTotalMinor,
    netPressureMinor: incomeTotalMinor - outflowTotalMinor,
    crunchDate: crunch?.date ?? null,
  }
}

export function radarCoachingLine(radar: ObligationRadar, currencyLabel: string): string {
  if (radar.obligations.length === 0) {
    return `Quiet next ${daysBetween(radar.windowStart, radar.windowEnd)} days — no bills or debts due.`
  }
  const out = formatRough(radar.outflowTotalMinor, currencyLabel)
  if (radar.netPressureMinor < 0) {
    return `${radar.obligations.filter((o) => o.isOutflow).length} obligations ahead (~${out} out). Pressure before ${radar.crunchDate ?? 'payday'}.`
  }
  return `${radar.obligations.filter((o) => o.isOutflow).length} bills/debts in the next fortnight (~${out}). You’re covered if income lands as planned.`
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)
  return Math.max(1, Math.round(ms / 86_400_000))
}

function formatRough(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(minor / 100)
  } catch {
    return `${(minor / 100).toFixed(0)} ${currency}`
  }
}
