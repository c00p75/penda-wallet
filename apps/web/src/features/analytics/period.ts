import { addLocalDays, localDateStr } from '@/lib/dates'

export type AnalyticsPeriod = '30d' | '3m' | '6m' | '12m' | 'ytd'

export type BucketGranularity = 'day' | 'week' | 'month'

export interface DateRange {
  /** Inclusive, YYYY-MM-DD. */
  start: string
  /** Inclusive, YYYY-MM-DD. */
  end: string
}

export const PERIOD_OPTIONS: { value: AnalyticsPeriod; label: string }[] = [
  { value: '30d', label: '30d' },
  { value: '3m', label: '3m' },
  { value: '6m', label: '6m' },
  { value: '12m', label: '12m' },
  { value: 'ytd', label: 'YTD' },
]

function daysBack(period: AnalyticsPeriod, now: Date): number {
  switch (period) {
    case '30d':
      return 30
    case '3m':
      return 90
    case '6m':
      return 182
    case '12m':
      return 365
    case 'ytd': {
      const start = new Date(now.getFullYear(), 0, 1)
      return Math.round((now.getTime() - start.getTime()) / 86_400_000) + 1
    }
  }
}

/** Range for the selected period, ending today (inclusive). */
export function periodRange(period: AnalyticsPeriod, now: Date = new Date()): DateRange {
  const span = daysBack(period, now)
  return { start: addLocalDays(now, -(span - 1)), end: localDateStr(now) }
}

/** The equal-length window immediately preceding `periodRange`, for delta comparisons. */
export function previousPeriodRange(period: AnalyticsPeriod, now: Date = new Date()): DateRange {
  const current = periodRange(period, now)
  const span = daysBack(period, now)
  const end = addLocalDays(new Date(`${current.start}T00:00:00`), -1)
  const start = addLocalDays(new Date(`${end}T00:00:00`), -(span - 1))
  return { start, end }
}

/** Bucket width to use for a trend chart covering this period, so it never renders empty or overcrowded. */
export function bucketGranularityFor(period: AnalyticsPeriod): BucketGranularity {
  switch (period) {
    case '30d':
      return 'day'
    case '3m':
      return 'week'
    case '6m':
    case '12m':
    case 'ytd':
      return 'month'
  }
}
