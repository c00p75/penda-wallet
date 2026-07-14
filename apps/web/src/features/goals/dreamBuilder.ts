/**
 * How much to set aside each month to hit a savings goal by its target date.
 * Returns null when there's no date to pace against, and 0 once the goal is
 * already funded. If the date has passed, the whole remainder is needed now.
 */
export function monthlyContributionMinor(
  targetMinor: number,
  currentMinor: number,
  targetDate: string | null,
  now: Date = new Date(),
): number | null {
  const remaining = Math.max(0, targetMinor - currentMinor)
  if (remaining === 0) return 0
  if (!targetDate) return null

  const [ty, tm, td] = targetDate.split('-').map(Number)
  const nowY = now.getUTCFullYear()
  const nowMo = now.getUTCMonth() + 1
  const nowD = now.getUTCDate()

  let monthsLeft = (ty - nowY) * 12 + (tm - nowMo)
  // If the day-of-month has already passed this month, that month no longer
  // counts as a full contribution window.
  if (td < nowD) monthsLeft -= 1
  monthsLeft = Math.max(1, monthsLeft)

  return Math.ceil(remaining / monthsLeft)
}
