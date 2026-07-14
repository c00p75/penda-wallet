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
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function GoalProgressCard({ goal, contributions, currency, onSelect, onAddFunds }: GoalProgressCardProps) {
  const pct = goal.target_amount_minor > 0 ? goal.current_amount_minor / goal.target_amount_minor : 0
  const forecast = estimateGoalCompletion(goal, contributions)
  const reached = pct >= 1

  // Goals live in a warm world (apricot); a reached goal turns celebratory mint.
  const accent = reached ? 'var(--mint)' : 'var(--apricot)'
  const ringPct = Math.round(Math.min(pct, 1) * 100)

  const forecastLine =
    forecast.kind === 'reached'
      ? { text: 'Reached 🎉', muted: false }
      : forecast.kind === 'projected'
        ? { text: `On pace · done by ${formatDate(forecast.projectedDate!)}`, muted: false }
        : forecast.kind === 'not-saving'
          ? { text: 'Paused — add funds to get moving', muted: true }
          : { text: 'Add funds to start tracking your pace', muted: true }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border p-4 shadow-sm"
      style={{ background: `linear-gradient(155deg, color-mix(in srgb, ${accent} 12%, var(--card)), var(--card))` }}
    >
      <button type="button" onClick={onSelect} className="flex items-center gap-4 text-left">
        <div
          className="grid size-20 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${accent} ${ringPct}%, color-mix(in srgb, ${accent} 16%, transparent) 0)` }}
        >
          <div className="grid size-[60px] place-items-center rounded-full bg-card text-sm font-bold tabular-nums">
            {ringPct}%
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-medium">
            {goal.icon && <span aria-hidden>{goal.icon}</span>}
            <span className="truncate">{goal.name}</span>
          </p>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            {formatMoney(goal.current_amount_minor, currency)} of {formatMoney(goal.target_amount_minor, currency)}
          </p>
          <p
            className="mt-1 text-sm font-medium"
            style={forecastLine.muted ? undefined : { color: accent }}
          >
            <span className={forecastLine.muted ? 'text-muted-foreground' : undefined}>{forecastLine.text}</span>
            {goal.target_date && (
              <span className="text-muted-foreground"> · target {formatDate(goal.target_date)}</span>
            )}
          </p>
        </div>
      </button>

      <button
        type="button"
        onClick={onAddFunds}
        className="self-start rounded-full bg-background/70 px-3 py-1.5 text-xs font-medium text-primary hover:bg-background"
      >
        Add / withdraw funds
      </button>
    </div>
  )
}
