export type ConfidenceLabel = 'building' | 'steady' | 'strong' | 'excellent'

export interface ConfidenceInputs {
  /** Current wallet balance in minor units. */
  balanceMinor: number
  /** This month's income in minor units. */
  monthIncomeMinor: number
  /** This month's expenses in minor units. */
  monthExpenseMinor: number
  /** Average goal progress 0–1 across active goals (empty → 0.5 neutral). */
  goalProgressAvg: number
  /** Budget adherence 0–1 (1 = under every cap; empty → 0.5 neutral). */
  budgetAdherence: number
}

export interface ConfidenceResult {
  score: number
  label: ConfidenceLabel
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function labelFor(score: number): ConfidenceLabel {
  if (score >= 80) return 'excellent'
  if (score >= 65) return 'strong'
  if (score >= 45) return 'steady'
  return 'building'
}

/**
 * Holistic financial confidence 0–100 from cash position, cashflow,
 * goal progress, and budget adherence — not a credit score.
 */
export function computeConfidenceScore(input: ConfidenceInputs): ConfidenceResult {
  const { balanceMinor, monthIncomeMinor, monthExpenseMinor, goalProgressAvg, budgetAdherence } = input

  // Cash position: healthy positive balance scores well; deep red is a drag.
  let cashScore = 50
  if (balanceMinor > 0) {
    const cushion = monthExpenseMinor > 0 ? balanceMinor / monthExpenseMinor : 1
    cashScore = clamp(40 + cushion * 40, 20, 100)
  } else if (balanceMinor < 0) {
    cashScore = clamp(30 + balanceMinor / Math.max(monthExpenseMinor, 1) * 20, 0, 40)
  }

  // Cashflow: surplus vs deficit this month.
  let flowScore = 50
  if (monthIncomeMinor + monthExpenseMinor > 0) {
    const net = monthIncomeMinor - monthExpenseMinor
    const denom = Math.max(monthIncomeMinor, monthExpenseMinor, 1)
    flowScore = clamp(50 + (net / denom) * 50, 0, 100)
  }

  const goalsScore = clamp(goalProgressAvg * 100, 0, 100)
  const budgetScore = clamp(budgetAdherence * 100, 0, 100)

  const score = Math.round(
    cashScore * 0.3 + flowScore * 0.3 + goalsScore * 0.2 + budgetScore * 0.2,
  )

  return { score: clamp(score, 0, 100), label: labelFor(score) }
}

export const CONFIDENCE_LABEL_COPY: Record<ConfidenceLabel, string> = {
  building: 'Building',
  steady: 'Steady',
  strong: 'Strong',
  excellent: 'Excellent',
}
