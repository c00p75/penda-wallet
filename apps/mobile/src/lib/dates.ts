/** Today's date in the local timezone as YYYY-MM-DD. */
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** First day of the local calendar month as YYYY-MM-01. */
export function localMonthStart(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** Last day of the local calendar month as YYYY-MM-DD. */
export function localMonthEnd(date: Date = new Date()): string {
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return localDateStr(end);
}

/** YYYY-MM prefix for the local calendar month. */
export function localMonthPrefix(date: Date = new Date()): string {
  return localMonthStart(date).slice(0, 7);
}

/** Parse a YYYY-MM-DD string as local midnight (not UTC). */
export function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Add calendar days to a local date, returning YYYY-MM-DD. */
export function addLocalDays(date: Date, days: number): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  return localDateStr(d);
}
