import { addLocalDays, localDateStr } from '@/lib/dates'

export interface ProtectWeekendPlan {
  title: string
  description: string
  startDate: string
  endDate: string
  /** Soft daily discretionary cap suggestion (minor units). */
  dailyCapMinor: number
  chatSeed: string
}

/**
 * One-tap weekend protect: Fri–Sun window with a tightened discretionary vibe.
 */
export function buildProtectWeekendPlan(input: {
  safeToSpendDailyMinor: number
  currency: string
  now?: Date
}): ProtectWeekendPlan {
  const now = input.now ?? new Date()
  const today = localDateStr(now)
  const dow = now.getDay() // 0 Sun … 6 Sat
  // Next Friday (or today if Friday–Sunday)
  let start = today
  if (dow === 0) {
    // Sunday — protect rest of today only → treat as Fri already started: use Fri of this week
    start = addLocalDays(now, -2)
  } else if (dow === 6) {
    start = addLocalDays(now, -1)
  } else if (dow !== 5) {
    const daysUntilFri = (5 - dow + 7) % 7 || 7
    start = addLocalDays(now, daysUntilFri)
  }
  const end = addLocalDays(parseLocal(start), 2)
  const dailyCap = Math.max(0, Math.floor(input.safeToSpendDailyMinor * 0.65))

  const title = 'Protect this weekend'
  const description =
    'Cash-light weekend: pause impulse categories, stick to essentials, check mid-Sunday.'
  const chatSeed =
    `I want to protect this weekend (${start} → ${end}). ` +
    `Aim for about ${fmt(dailyCap, input.currency)}/day discretionary. ` +
    `Set a mission and keep me honest.`

  return { title, description, startDate: start, endDate: end, dailyCapMinor: dailyCap, chatSeed }
}

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

function fmt(minor: number, currency: string): string {
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
