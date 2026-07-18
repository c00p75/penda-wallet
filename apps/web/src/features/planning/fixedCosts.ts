import type { RecurringFrequency, RecurringTransaction } from '@/features/recurring/types'
import type { Transaction } from '@/features/transactions/types'

export interface ActualSpendSplit {
  totalMinor: number
  /** Spend Penda auto-posted from a recurring rule, rent, subs, utilities. */
  fixedMinor: number
  /** Everything else, the discretionary spend a plan can actually flex. */
  flexibleMinor: number
}

/**
 * Split money already spent this period into fixed vs flexible. Fixed spend is
 * anything that landed via a recurring rule (`source === 'recurring'`) or
 * matches a detected recurring pattern (see `detectRecurringSpend`), the
 * commitments you don't re-decide each day. Everything else is flexible, which
 * is where a plan and the safe-to-spend number have room to work.
 */
export function splitActualSpend(
  transactions: Transaction[],
  since: string,
  detectedKeys: ReadonlySet<string> = new Set(),
): ActualSpendSplit {
  let fixedMinor = 0
  let flexibleMinor = 0
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    if (tx.transaction_date < since) continue
    const key = recurrenceKey(tx)
    if (tx.source === 'recurring' || (key && detectedKeys.has(key))) fixedMinor += tx.amount_minor
    else flexibleMinor += tx.amount_minor
  }
  return { totalMinor: fixedMinor + flexibleMinor, fixedMinor, flexibleMinor }
}

export interface RecurringCandidate {
  /** Normalized merchant/description used to match future transactions. */
  key: string
  label: string
  categoryId: string | null
  averageAmountMinor: number
  cadence: 'weekly' | 'monthly'
  occurrences: number
  lastDate: string
}

const CADENCE_WINDOWS = {
  weekly: [5, 10],
  monthly: [24, 37],
} as const

/** Max fractional deviation of any single amount from the group's mean before a pattern is rejected as unstable. */
const AMOUNT_STABILITY_TOLERANCE = 0.2

function recurrenceKey(tx: Transaction): string | null {
  const raw = (tx.merchant || tx.description || '').trim().toLowerCase()
  return raw || null
}

/**
 * Detect recurring spend Penda hasn't been told about yet, same merchant,
 * stable amount, roughly periodic, so the budget assist flow can pre-fill it
 * as a fixed line and only ask the user about the genuinely flexible
 * remainder. Complements `source === 'recurring'` (rules the user already
 * registered) rather than replacing it: it looks at raw transaction history
 * (manual, SMS, chat, receipt), not just materialized recurring rules.
 */
export function detectRecurringSpend(
  transactions: Transaction[],
  options: { now?: Date; months?: number } = {},
): RecurringCandidate[] {
  const now = options.now ?? new Date()
  const months = options.months ?? 3
  const cutoff = new Date(now)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months)
  const cutoffStr = toStr(cutoff)

  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    if (tx.source === 'recurring') continue // already tracked as fixed
    if (tx.transaction_date < cutoffStr) continue
    const key = recurrenceKey(tx)
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(tx)
    else groups.set(key, [tx])
  }

  const candidates: RecurringCandidate[] = []
  for (const [key, group] of groups) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))

    const amounts = sorted.map((t) => t.amount_minor)
    const meanAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length
    if (meanAmount <= 0) continue
    const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - meanAmount)))
    if (maxDeviation / meanAmount > AMOUNT_STABILITY_TOLERANCE) continue

    const intervals: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(
        Math.round(
          (parseUTC(sorted[i].transaction_date).getTime() - parseUTC(sorted[i - 1].transaction_date).getTime()) /
            86_400_000,
        ),
      )
    }
    const avgInterval = intervals.reduce((sum, d) => sum + d, 0) / intervals.length

    const cadence = (Object.keys(CADENCE_WINDOWS) as (keyof typeof CADENCE_WINDOWS)[]).find((c) => {
      const [lo, hi] = CADENCE_WINDOWS[c]
      return avgInterval >= lo && avgInterval <= hi
    })
    if (!cadence) continue

    const last = sorted[sorted.length - 1]
    candidates.push({
      key,
      label: last.merchant || last.description || key,
      categoryId: last.category_id,
      averageAmountMinor: Math.round(meanAmount),
      cadence,
      occurrences: sorted.length,
      lastDate: last.transaction_date,
    })
  }

  return candidates.sort((a, b) => b.averageAmountMinor - a.averageAmountMinor)
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
 * plan must still reserve for before the period ends, the reserve the
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
