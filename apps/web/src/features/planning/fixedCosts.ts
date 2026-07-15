import type { RecurringFrequency, RecurringTransaction } from '@/features/recurring/types'
import type { Transaction } from '@/features/transactions/types'

export interface ActualSpendSplit {
  totalMinor: number
  /** Spend Penda auto-posted from a recurring rule — rent, subs, utilities. */
  fixedMinor: number
  /** Everything else — the discretionary spend a plan can actually flex. */
  flexibleMinor: number
}

/**
 * Split money already spent this period into fixed vs flexible. Fixed spend is
 * anything that landed via a recurring rule (`source === 'recurring'`) — the
 * commitments you don't re-decide each day. Everything else is flexible, which
 * is where a plan and the safe-to-spend number have room to work.
 */
export function splitActualSpend(transactions: Transaction[], since: string): ActualSpendSplit {
  let fixedMinor = 0
  let flexibleMinor = 0
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    if (tx.transaction_date < since) continue
    if (tx.source === 'recurring') fixedMinor += tx.amount_minor
    else flexibleMinor += tx.amount_minor
  }
  return { totalMinor: fixedMinor + flexibleMinor, fixedMinor, flexibleMinor }
}

export interface UpcomingFixedItem {
  label: string
  amountMinor: number
  date: string
}

export interface UpcomingFixed {
  totalMinor: number
  items: UpcomingFixedItem[]
}

function parseUTC(str: string): Date {
  return new Date(`${str}T00:00:00Z`)
}

function toStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function step(date: Date, freq: RecurringFrequency): Date {
  const d = new Date(date)
  switch (freq) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1)
      break
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7)
      break
    case 'monthly':
      d.setUTCMonth(d.getUTCMonth() + 1)
      break
    case 'yearly':
      d.setUTCFullYear(d.getUTCFullYear() + 1)
      break
  }
  return d
}

/**
 * Recurring expense commitments due between `fromStr` and `toStr` (both
 * inclusive), expanded from active recurring rules. These are the fixed bills a
 * plan must still reserve for before the period ends — the reserve the
 * safe-to-spend number sets aside so "free money" isn't quietly spoken for.
 */
export function upcomingFixedCosts(
  recurring: RecurringTransaction[],
  fromStr: string,
  toStr2: string,
): UpcomingFixed {
  const items: UpcomingFixedItem[] = []
  const GUARD = 1200
  for (const rule of recurring) {
    if (!rule.is_active) continue
    if (rule.template.type !== 'expense') continue
    let d = parseUTC(rule.next_run_date)
    let guard = 0
    // Fast-forward to the window in case next_run_date is in the past.
    while (toStr(d) < fromStr && guard < GUARD) {
      d = step(d, rule.frequency)
      guard += 1
    }
    while (toStr(d) <= toStr2 && guard < GUARD) {
      items.push({
        label: rule.template.merchant || rule.template.description || 'Bill',
        amountMinor: rule.template.amount_minor,
        date: toStr(d),
      })
      d = step(d, rule.frequency)
      guard += 1
    }
  }
  return { totalMinor: items.reduce((sum, i) => sum + i.amountMinor, 0), items }
}
