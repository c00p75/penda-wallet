import { formatMoney } from '@/lib/money'
import type { Category } from '@/features/categories/types'
import type { BudgetProgress } from './types'

interface BudgetProgressCardProps {
  progress: BudgetProgress
  category: Category | null
  currency: string
  onSelect: () => void
}

// Coaching over shaming: over-budget goes warm rose with an offer to help,
// never an alarm-red failure state.
function statusFor(pct: number) {
  if (pct >= 1) {
    return { color: 'var(--rose)', label: 'Over — let’s rebalance' }
  }
  if (pct >= 0.8) {
    return { color: 'var(--apricot)', label: 'Running warm' }
  }
  return { color: 'var(--mint)', label: 'Comfortable' }
}

export function BudgetProgressCard({ progress, category, currency, onSelect }: BudgetProgressCardProps) {
  const cap = progress.effective_amount_minor
  const pct = cap > 0 ? progress.spent_minor / cap : 0
  const status = statusFor(pct)
  const remaining = cap - progress.spent_minor
  const ringPct = Math.round(Math.min(pct, 1) * 100)

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div
        className="grid size-16 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(${status.color} ${ringPct}%, color-mix(in srgb, ${status.color} 16%, transparent) 0)` }}
      >
        <div className="grid size-[52px] place-items-center rounded-full bg-card text-sm font-semibold tabular-nums">
          {ringPct}%
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-medium">
            {category?.icon && <span aria-hidden>{category.icon} </span>}
            {category?.name ?? 'Overall'}
          </p>
          <p className="shrink-0 text-xs capitalize text-muted-foreground">{progress.period}</p>
        </div>
        <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
          {formatMoney(progress.spent_minor, currency)} of {formatMoney(cap, currency)}
          {progress.carried_over_minor !== 0 && (
            <span className="ml-1">
              ({progress.carried_over_minor > 0 ? '+' : '−'}
              {formatMoney(Math.abs(progress.carried_over_minor), currency)} rolled over)
            </span>
          )}
        </p>
        <p className="mt-1 text-sm font-medium" style={{ color: status.color }}>
          {status.label}
          {remaining >= 0
            ? ` · ${formatMoney(remaining, currency)} left`
            : ` · ${formatMoney(-remaining, currency)} over`}
        </p>
      </div>
    </button>
  )
}
