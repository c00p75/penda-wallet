/**
 * Salary-day orchestrator: propose how to split a cash-in across
 * buffer → fixed costs → goals → fun money (confirmable plan, no auto-post).
 */

export interface SalaryOrchestratorInput {
  incomeMinor: number
  /** Upcoming fixed bills remaining this month. */
  fixedCostsMinor: number
  /** Desired buffer (e.g. from suggestBufferFromIncome). */
  bufferMinor: number
  /** Pay-yourself-first / goals set-aside. */
  goalsMinor: number
  /** Optional tax reserve for business mode. */
  taxReserveMinor?: number
}

export interface SalarySlice {
  key: 'tax' | 'fixed' | 'buffer' | 'goals' | 'fun'
  label: string
  amountMinor: number
}

export interface SalaryPlan {
  incomeMinor: number
  slices: SalarySlice[]
  shortfallMinor: number
}

export function buildSalaryPlan(input: SalaryOrchestratorInput): SalaryPlan {
  let remaining = Math.max(0, input.incomeMinor)
  const slices: SalarySlice[] = []

  const take = (key: SalarySlice['key'], label: string, want: number) => {
    const amount = Math.min(remaining, Math.max(0, Math.floor(want)))
    if (amount <= 0) return
    slices.push({ key, label, amountMinor: amount })
    remaining -= amount
  }

  if (input.taxReserveMinor && input.taxReserveMinor > 0) {
    take('tax', 'Tax set-aside', input.taxReserveMinor)
  }
  take('fixed', 'Fixed costs / bills', input.fixedCostsMinor)
  take('buffer', 'Buffer', input.bufferMinor)
  take('goals', 'Goals / pay yourself first', input.goalsMinor)
  if (remaining > 0) {
    slices.push({ key: 'fun', label: 'Flexible / fun money', amountMinor: remaining })
    remaining = 0
  }

  const allocated = slices.reduce((s, x) => s + x.amountMinor, 0)
  const needed =
    (input.taxReserveMinor ?? 0) +
    input.fixedCostsMinor +
    input.bufferMinor +
    input.goalsMinor
  const shortfallMinor = Math.max(0, needed - allocated)

  return { incomeMinor: input.incomeMinor, slices, shortfallMinor }
}

export function salaryPlanChatSeed(plan: SalaryPlan, currency: string): string {
  const lines = plan.slices.map((s) => `• ${s.label}: ${fmt(s.amountMinor, currency)}`)
  const short =
    plan.shortfallMinor > 0
      ? `\nShort by ${fmt(plan.shortfallMinor, currency)} vs ideal. Trim buffer or fun first.`
      : ''
  return (
    `Salary plan for ${fmt(plan.incomeMinor, currency)}:\n${lines.join('\n')}${short}\n` +
    `Help me apply this. Which slices should I confirm?`
  )
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
