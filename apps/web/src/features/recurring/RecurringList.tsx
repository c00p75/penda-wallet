import { Switch } from '@/components/ui/switch'
import { formatMoney } from '@/lib/money'
import type { Category } from '@/features/categories/types'
import type { RecurringTransaction } from './types'

interface RecurringListProps {
  recurring: RecurringTransaction[]
  categories: Category[]
  onSelect: (recurring: RecurringTransaction) => void
  onToggleActive: (recurring: RecurringTransaction, isActive: boolean) => void
}

function formatFrequency(frequency: RecurringTransaction['frequency']) {
  return frequency.charAt(0).toUpperCase() + frequency.slice(1)
}

function formatNextRun(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function RecurringList({ recurring, categories, onSelect, onToggleActive }: RecurringListProps) {
  if (recurring.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-16 text-center text-muted-foreground">
        <p className="font-medium">No recurring transactions yet</p>
        <p className="text-sm">Add rent, subscriptions, or your paycheck to automate them.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      {recurring.map((rule) => {
        const category = categories.find((c) => c.id === rule.template.category_id)
        return (
          <div
            key={rule.id}
            className="flex items-center justify-between gap-3 border-b p-3 last:border-b-0"
          >
            <button
              type="button"
              onClick={() => onSelect(rule)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-sm font-medium">
                {rule.template.merchant || category?.name || 'Uncategorized'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatFrequency(rule.frequency)} · next {formatNextRun(rule.next_run_date)}
              </p>
            </button>
            <span
              className={
                rule.template.type === 'income'
                  ? 'shrink-0 text-sm font-medium text-emerald-600 dark:text-emerald-400'
                  : 'shrink-0 text-sm font-medium'
              }
            >
              {rule.template.type === 'income' ? '+' : '-'}
              {formatMoney(rule.template.amount_minor, rule.template.currency)}
            </span>
            <Switch
              checked={rule.is_active}
              onCheckedChange={(checked) => onToggleActive(rule, checked)}
              aria-label={rule.is_active ? 'Pause' : 'Resume'}
            />
          </div>
        )
      })}
    </div>
  )
}
