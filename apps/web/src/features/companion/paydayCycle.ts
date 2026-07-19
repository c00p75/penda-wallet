import { formatMoney } from '@/lib/money'

export interface IncomeEvent {
  transaction_date: string
  amount_minor: number
}

export type PaydayPhase = 'pre' | 'day' | 'post'

export interface PaydayCadence {
  /** Typical gap between income events (days), or null if unknown. */
  intervalDays: number | null
  lastPayday: string | null
  /** Best-effort next payday from cadence or recurring. */
  nextPayday: string | null
  typicalAmountMinor: number | null
}

/**
 * Infer payday cadence from recent income transactions (median gap).
 */
export function inferPaydayCadence(
  income: IncomeEvent[],
  opts: { now?: Date; recurringNextIncome?: string | null } = {},
): PaydayCadence {
  const now = opts.now ?? new Date()
  const today = now.toISOString().slice(0, 10)
  const dates = [...new Set(income.map((i) => i.transaction_date))]
    .filter(Boolean)
    .sort()

  const lastPayday = dates.length > 0 ? dates[dates.length - 1]! : null
  const gaps: number[] = []
  for (let i = 1; i < dates.length; i++) {
    const a = Date.parse(`${dates[i - 1]}T00:00:00Z`)
    const b = Date.parse(`${dates[i]}T00:00:00Z`)
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      gaps.push(Math.round((b - a) / 86_400_000))
    }
  }

  const intervalDays = gaps.length > 0 ? median(gaps) : null
  let nextPayday: string | null = opts.recurringNextIncome ?? null

  if (!nextPayday && lastPayday && intervalDays && intervalDays >= 5 && intervalDays <= 45) {
    const d = new Date(`${lastPayday}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + intervalDays)
    const candidate = d.toISOString().slice(0, 10)
    if (candidate >= today) nextPayday = candidate
  }

  const recentAmounts = income
    .filter((i) => i.transaction_date >= daysAgo(today, 90))
    .map((i) => i.amount_minor)
  const typicalAmountMinor =
    recentAmounts.length > 0 ? Math.round(median(recentAmounts)) : null

  return { intervalDays, lastPayday, nextPayday, typicalAmountMinor }
}

export function paydayPhase(nextPayday: string | null, now = new Date()): PaydayPhase | null {
  if (!nextPayday) return null
  const today = now.toISOString().slice(0, 10)
  const days = daysBetween(today, nextPayday)
  if (days === 1 || days === 2) return 'pre'
  if (days === 0) return 'day'
  if (days === -1 || days === -2) return 'post'
  return null
}

export function buildPaydayMessage(opts: {
  phase: PaydayPhase
  currency: string
  freeBeforePaydayMinor?: number | null
  typicalAmountMinor?: number | null
  /** Current wallet balance. Day/post allocate copy is suppressed when cash is gone. */
  availableBalanceMinor?: number | null
}): { title: string; body: string; chatSeed: string } {
  const free =
    opts.freeBeforePaydayMinor != null
      ? formatMoney(Math.abs(opts.freeBeforePaydayMinor), opts.currency)
      : null
  const typical =
    opts.typicalAmountMinor != null ? formatMoney(opts.typicalAmountMinor, opts.currency) : null
  const cashGone =
    opts.availableBalanceMinor != null && opts.availableBalanceMinor <= 0

  if (opts.phase === 'pre') {
    return {
      title: 'Payday soon',
      body:
        free != null
          ? opts.freeBeforePaydayMinor! < 0
            ? `You’re about ${free} short before payday, want a quick plan?`
            : `About ${free} free before payday. Want to lock a buffer?`
          : `Payday’s almost here. Want a short pre-payday plan?`,
      chatSeed: 'Help me plan the next 48 hours before payday.',
    }
  }

  if (opts.phase === 'day') {
    if (cashGone) {
      return {
        title: 'Payday',
        body: 'Payday cash looks spent already. Want a catch-up plan for the rest of the period?',
        chatSeed: 'Help me catch up after payday spending.',
      }
    }
    return {
      title: 'Payday',
      body: typical
        ? `Payday energy. Typical take-home ~${typical}, shall we allocate it?`
        : `Payday. Want help splitting bills, buffer, and fun money?`,
      chatSeed: 'Help me allocate today’s payday.',
    }
  }

  if (cashGone) {
    return {
      title: 'After payday',
      body: 'Payday already looks spent down. Want a catch-up plan instead of an allocation check?',
      chatSeed: 'Help me catch up after payday spending.',
    }
  }

  return {
    title: 'After payday',
    body: `Payday landed. Did you set aside savings first, or want a quick allocation check?`,
    chatSeed: 'Check my post-payday allocation.',
  }
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!
}

function daysAgo(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}
