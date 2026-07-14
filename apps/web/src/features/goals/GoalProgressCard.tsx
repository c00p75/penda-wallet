import { PartyPopper, TrendingUp } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { formatMoney } from '@/lib/money'
import type { SavingsContribution, SavingsGoal } from './types'
import { estimateGoalCompletion } from './forecast'

interface GoalProgressCardProps {
  goal: SavingsGoal
  contributions: SavingsContribution[]
  currency: string
  onSelect: () => void
  onAddFunds: () => void
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function GoalProgressCard({ goal, contributions, currency, onSelect, onAddFunds }: GoalProgressCardProps) {
  const pct = goal.target_amount_minor > 0 ? goal.current_amount_minor / goal.target_amount_minor : 0
  const forecast = estimateGoalCompletion(goal, contributions)

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <button type="button" onClick={onSelect} className="flex flex-col gap-2 text-left">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{goal.name}</p>
          <p className="shrink-0 text-sm font-medium">
            {formatMoney(goal.current_amount_minor, currency)}{' '}
            <span className="text-muted-foreground">/ {formatMoney(goal.target_amount_minor, currency)}</span>
          </p>
        </div>

        <Progress
          value={Math.min(pct, 1) * 100}
          className="h-1.5"
          indicatorClassName={pct >= 1 ? 'bg-[var(--status-good)]' : 'bg-primary'}
        />

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {forecast.kind === 'reached' && (
            <>
              <PartyPopper className="size-3.5 text-[var(--status-good)]" />
              <span className="font-medium text-[var(--status-good)]">Goal reached!</span>
            </>
          )}
          {forecast.kind === 'projected' && (
            <>
              <TrendingUp className="size-3.5" />
              <span>At this rate, done by {formatDate(forecast.projectedDate!)}</span>
            </>
          )}
          {forecast.kind === 'not-saving' && <span>No net progress recently</span>}
          {forecast.kind === 'insufficient-data' && <span>Add funds to start tracking your pace</span>}
          {goal.target_date && <span>· target {formatDate(goal.target_date)}</span>}
        </div>
      </button>

      <button
        type="button"
        onClick={onAddFunds}
        className="self-start text-xs font-medium text-primary hover:underline"
      >
        Add / withdraw funds
      </button>
    </div>
  )
}
