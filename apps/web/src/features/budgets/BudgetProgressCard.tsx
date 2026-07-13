import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { formatMoney } from '@/lib/money'
import type { Category } from '@/features/categories/types'
import type { BudgetProgress } from './types'

interface BudgetProgressCardProps {
  progress: BudgetProgress
  category: Category | null
  currency: string
  onSelect: () => void
}

function statusFor(pct: number) {
  if (pct >= 1) {
    return {
      key: 'critical' as const,
      label: 'Over budget',
      Icon: AlertCircle,
      ink: 'text-[var(--status-critical)]',
      bar: 'bg-[var(--status-critical)]',
    }
  }
  if (pct >= 0.8) {
    return {
      key: 'warning' as const,
      label: 'Almost there',
      Icon: AlertTriangle,
      ink: 'text-[var(--status-warning)]',
      bar: 'bg-[var(--status-warning)]',
    }
  }
  return {
    key: 'good' as const,
    label: 'On track',
    Icon: CheckCircle2,
    ink: 'text-[var(--status-good)]',
    bar: 'bg-[var(--status-good)]',
  }
}

export function BudgetProgressCard({ progress, category, currency, onSelect }: BudgetProgressCardProps) {
  const pct = progress.amount_minor > 0 ? progress.spent_minor / progress.amount_minor : 0
  const status = statusFor(pct)
  const remaining = progress.amount_minor - progress.spent_minor
  const { Icon } = status

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full flex-col gap-2 rounded-lg border p-3 text-left hover:bg-accent"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{category?.name ?? 'Overall'}</p>
          <p className="text-xs capitalize text-muted-foreground">{progress.period}</p>
        </div>
        <p className="shrink-0 text-sm font-medium">
          {formatMoney(progress.spent_minor, currency)}{' '}
          <span className="text-muted-foreground">/ {formatMoney(progress.amount_minor, currency)}</span>
        </p>
      </div>

      <Progress value={Math.min(pct, 1) * 100} className="h-1.5" indicatorClassName={status.bar} />

      <div className={`flex items-center gap-1.5 text-xs font-medium ${status.ink}`}>
        <Icon className="size-3.5" />
        <span>
          {status.label}
          {remaining >= 0
            ? ` — ${formatMoney(remaining, currency)} left`
            : ` — ${formatMoney(-remaining, currency)} over`}
        </span>
      </div>
    </button>
  )
}
