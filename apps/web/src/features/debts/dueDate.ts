import type { Debt } from './types'

/** Calendar date YYYY-MM-DD in local time (debts due_date is a date, not timestamptz). */
export function localDateStr(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export type DebtDueUrgency = 'overdue' | 'due_today' | 'due_soon' | 'none'

/** How soon an open debt is due. Settled debts and missing dates are none. */
export function debtDueUrgency(debt: Pick<Debt, 'due_date' | 'balance_minor'>, today = localDateStr()): DebtDueUrgency {
  if (debt.balance_minor <= 0 || !debt.due_date) return 'none'
  if (debt.due_date < today) return 'overdue'
  if (debt.due_date === today) return 'due_today'
  const inThree = new Date(`${today}T00:00:00`)
  inThree.setDate(inThree.getDate() + 3)
  const soon = localDateStr(inThree)
  if (debt.due_date <= soon) return 'due_soon'
  return 'none'
}

/** Overdue first, then due today/soon, then later dates, then no due date. */
export function sortDebtsByDueDate<T extends Pick<Debt, 'due_date' | 'balance_minor' | 'created_at'>>(
  debts: T[],
  today = localDateStr(),
): T[] {
  const rank = (d: T) => {
    const u = debtDueUrgency(d, today)
    if (u === 'overdue') return 0
    if (u === 'due_today') return 1
    if (u === 'due_soon') return 2
    if (d.due_date && d.balance_minor > 0) return 3
    return 4
  }
  return [...debts].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    if (a.due_date && b.due_date && a.due_date !== b.due_date) {
      return a.due_date < b.due_date ? -1 : 1
    }
    return a.created_at < b.created_at ? 1 : -1
  })
}
