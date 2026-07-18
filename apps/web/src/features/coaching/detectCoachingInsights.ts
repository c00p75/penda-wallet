import type { InsightTone } from '@/components/AiInsight'
import type { Transaction } from '@/features/transactions/types'
import type { Budget } from '@/features/budgets/types'
import type { SavingsGoal } from '@/features/goals/types'
import { formatMoney } from '@/lib/money'
import { suggestBudgets } from '@/features/budgets/suggestBudgets'
import { detectGhostLeaks } from './detectGhostLeaks'

export type CoachingKind = 'attention' | 'opportunity' | 'celebration' | 'observability'

export interface CoachingAction {
  label: string
  kind: 'create-budget' | 'fund-goal' | 'view-budgets' | 'view-goals'
  categoryId?: string
  goalId?: string
}

export interface CoachingInsight {
  id: string
  kind: CoachingKind
  tone: InsightTone
  text: string
  /** Money figure central to the insight, when there is one. */
  amountMinor?: number
  action?: CoachingAction
}

export interface CoachingContext {
  transactions: Transaction[]
  budgets: Budget[]
  goals: SavingsGoal[]
  currency: string
  now?: Date
}

const PRIORITY: Record<CoachingKind, number> = {
  attention: 4,
  opportunity: 3,
  celebration: 3,
  observability: 2,
}

function offsetStr(now: Date, days: number): string {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function sumExpenseBetween(transactions: Transaction[], afterExclusive: string, throughInclusive: string): number {
  return transactions
    .filter(
      (tx) =>
        tx.type === 'expense' && tx.transaction_date > afterExclusive && tx.transaction_date <= throughInclusive,
    )
    .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)
}

/**
 * Penda's "speak first, unprompted" brain: derive at most a handful of coaching
 * insights from real data, an underspend opportunity, an unbudgeted-spend
 * nudge, a goal to celebrate, ranked so the most useful one leads. Pure so it
 * can drive both the in-app card and (later) scheduled push.
 */
export function detectCoachingInsights(ctx: CoachingContext): CoachingInsight[] {
  const now = ctx.now ?? new Date()
  const { transactions, budgets, goals, currency } = ctx
  const insights: CoachingInsight[] = []

  // Opportunity, spent noticeably less than usual this week.
  const last7 = sumExpenseBetween(transactions, offsetStr(now, -7), offsetStr(now, 0))
  const priorFourWeeks = sumExpenseBetween(transactions, offsetStr(now, -35), offsetStr(now, -7))
  const baselineWeekly = priorFourWeeks / 4
  if (baselineWeekly >= 20000 && last7 <= baselineWeekly * 0.7) {
    const diff = Math.round(baselineWeekly - last7)
    const goal = goals.find((g) => g.current_amount_minor < g.target_amount_minor)
    insights.push({
      id: 'opportunity:underspend',
      kind: 'opportunity',
      tone: 'warm',
      amountMinor: diff,
      text: goal
        ? `You spent ${formatMoney(diff, currency)} less than usual this week, want to move it toward "${goal.name}"?`
        : `You spent ${formatMoney(diff, currency)} less than usual this week. A great moment to stash it.`,
      action: goal
        ? { label: `Fund ${goal.name}`, kind: 'fund-goal', goalId: goal.id }
        : { label: 'See goals', kind: 'view-goals' },
    })
  }

  // Observability, a category with a clear pattern but no budget.
  const budgetedCategoryIds = budgets.map((b) => b.category_id).filter((id): id is string => !!id)
  const [topUnbudgeted] = suggestBudgets(transactions, { now, existingCategoryIds: budgetedCategoryIds })
  if (topUnbudgeted) {
    insights.push({
      id: `observability:${topUnbudgeted.categoryId}`,
      kind: 'observability',
      tone: 'default',
      amountMinor: topUnbudgeted.suggestedAmountMinor,
      text: `You’re spending about ${formatMoney(topUnbudgeted.monthlyAverageMinor, currency)}/mo on ${topUnbudgeted.categoryName} with no budget. Want one?`,
      action: { label: 'Set a budget', kind: 'create-budget', categoryId: topUnbudgeted.categoryId },
    })
  }

  // Celebration, a goal that's funded or nearly there.
  const closest = goals
    .map((g) => ({ g, pct: g.target_amount_minor > 0 ? g.current_amount_minor / g.target_amount_minor : 0 }))
    .filter((x) => x.pct >= 0.8)
    .sort((a, b) => b.pct - a.pct)[0]
  if (closest) {
    const { g, pct } = closest
    const remaining = Math.max(0, g.target_amount_minor - g.current_amount_minor)
    insights.push({
      id: `celebration:${g.id}`,
      kind: 'celebration',
      tone: 'warm',
      amountMinor: remaining,
      text:
        pct >= 1
          ? `🎉 You fully funded "${g.name}". Time to set the next dream?`
          : `You’re ${Math.round(pct * 100)}% of the way to "${g.name}", only ${formatMoney(remaining, currency)} to go!`,
      action: { label: 'View goals', kind: 'view-goals', goalId: g.id },
    })
  }

  // Ghost leaks, fees and tiny repeated P2P sends.
  insights.push(...detectGhostLeaks({ transactions, currency, now }))

  return insights.sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind])
}
