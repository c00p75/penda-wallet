/**
 * Local-calendar date helpers (self-contained copy for the shared package, so
 * cashflow projection doesn't depend on either app's date module). Transaction
 * dates are calendar days with no time, so formatting via UTC would shift the
 * day for UTC+ users near midnight.
 */

/** Today's date in the local timezone as YYYY-MM-DD. */
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parse a YYYY-MM-DD string as local midnight (not UTC). */
export function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Add calendar days to a local date, returning YYYY-MM-DD. */
export function addLocalDays(date: Date, days: number): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
  return localDateStr(d)
}
