export type SpendingPlanPace = 'ahead' | 'on-track' | 'over-pace' | 'over'

export interface SpendingPlanStatus {
  intendedMinor: number
  spentMinor: number
  remainingMinor: number
  /** Spend projected for the full month at the current rate. */
  projectedMinor: number
  /** What you could spend each remaining day and still land on plan. */
  dailyAllowanceMinor: number
  daysLeft: number
  pace: SpendingPlanPace
}

export interface SpendingPlanInput {
  intendedMinor: number
  spentMinor: number
  /** First day of the plan month (YYYY-MM-DD). */
  monthStart: string
  now?: Date
}

function daysInMonthOf(monthStart: string): number {
  const [y, m] = monthStart.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * Compare actual spend against a monthly intention, pacing it against how far
 * into the month we are — the "act" half of the plan → act → reflect loop.
 */
export function computeSpendingPlanStatus(input: SpendingPlanInput): SpendingPlanStatus {
  const now = input.now ?? new Date()
  const { intendedMinor, spentMinor, monthStart } = input

  const daysInMonth = daysInMonthOf(monthStart)
  const dayOfMonth = Math.min(Math.max(1, now.getUTCDate()), daysInMonth)
  const daysLeft = daysInMonth - dayOfMonth

  const projectedMinor = Math.round((spentMinor / dayOfMonth) * daysInMonth)
  const remainingMinor = intendedMinor - spentMinor
  const dailyAllowanceMinor = daysLeft > 0 ? Math.round(Math.max(0, remainingMinor) / daysLeft) : 0

  let pace: SpendingPlanPace
  if (spentMinor > intendedMinor) pace = 'over'
  else if (projectedMinor > intendedMinor * 1.05) pace = 'over-pace'
  else if (projectedMinor < intendedMinor * 0.9) pace = 'ahead'
  else pace = 'on-track'

  return { intendedMinor, spentMinor, remainingMinor, projectedMinor, dailyAllowanceMinor, daysLeft, pace }
}

export interface SafeToSpendInput {
  intendedMinor: number
  spentMinor: number
  /** Fixed commitments still due before the period ends — reserve these. */
  upcomingFixedMinor: number
  /** First day of the plan month (YYYY-MM-DD). */
  monthStart: string
  now?: Date
}

export interface SafeToSpend {
  /** Plan money left after reserving for upcoming fixed commitments. */
  discretionaryRemainingMinor: number
  reservedFixedMinor: number
  /** What you can comfortably spend today and still land on plan. */
  perDayMinor: number
  /** Remaining days counting today. */
  daysLeftInclusive: number
}

/**
 * The headline number: after what's already spent AND the fixed bills still due
 * this period, how much is genuinely free — as a per-day figure that answers
 * "can I buy this today?" without quietly spending money already spoken for.
 */
export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpend {
  const now = input.now ?? new Date()
  const daysInMonth = daysInMonthOf(input.monthStart)
  const dayOfMonth = Math.min(Math.max(1, now.getUTCDate()), daysInMonth)
  const daysLeftInclusive = daysInMonth - dayOfMonth + 1

  const reservedFixedMinor = Math.max(0, input.upcomingFixedMinor)
  const discretionaryRemainingMinor = input.intendedMinor - input.spentMinor - reservedFixedMinor
  const perDayMinor = Math.round(Math.max(0, discretionaryRemainingMinor) / daysLeftInclusive)

  return { discretionaryRemainingMinor, reservedFixedMinor, perDayMinor, daysLeftInclusive }
}
