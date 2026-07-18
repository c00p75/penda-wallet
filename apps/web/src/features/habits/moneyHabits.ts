/** Spare change to next major unit (100 minor = 1.00 for 2-decimal currencies). */
export function roundUpSpareMinor(amountMinor: number, unit = 100): number {
  if (amountMinor <= 0 || unit <= 0) return 0
  const spare = Math.ceil(amountMinor / unit) * unit - amountMinor
  return spare > 0 ? spare : 0
}

/** Floor percent of amount for pay-yourself-first. */
export function payYourselfFirstMinor(amountMinor: number, pct: number): number {
  if (amountMinor <= 0 || pct <= 0) return 0
  return Math.floor((amountMinor * pct) / 100)
}

export interface HabitContribution {
  kind: 'round_up' | 'pay_yourself_first'
  amount_minor: number
  goal_id: string
}

export interface ApplyMoneyHabitsResult {
  applied: boolean
  reason?: string
  contributions?: HabitContribution[]
}
