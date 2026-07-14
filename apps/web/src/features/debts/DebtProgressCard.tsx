import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { formatMoney } from '@/lib/money'
import type { Debt } from './types'

interface DebtProgressCardProps {
  debt: Debt
  currency: string
  onSelect: () => void
  onLogPayment: () => void
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function DebtProgressCard({ debt, currency, onSelect, onLogPayment }: DebtProgressCardProps) {
  const paidOff = debt.principal_minor > 0 ? 1 - Math.max(debt.balance_minor, 0) / debt.principal_minor : 0
  const isSettled = debt.balance_minor <= 0
  const DirectionIcon = debt.direction === 'i_owe' ? ArrowUpRight : ArrowDownLeft

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <button type="button" onClick={onSelect} className="flex flex-col gap-2 text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <DirectionIcon
              className={`size-3.5 shrink-0 ${debt.direction === 'i_owe' ? 'text-[var(--status-critical)]' : 'text-[var(--status-good)]'}`}
            />
            <p className="truncate text-sm font-medium">{debt.name}</p>
          </div>
          <p className="shrink-0 text-sm font-medium">{formatMoney(Math.max(debt.balance_minor, 0), currency)}</p>
        </div>

        <Progress
          value={Math.min(Math.max(paidOff, 0), 1) * 100}
          className="h-1.5"
          indicatorClassName={isSettled ? 'bg-[var(--status-good)]' : 'bg-primary'}
        />

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {isSettled ? (
            <>
              <CheckCircle2 className="size-3.5 text-[var(--status-good)]" />
              <span className="font-medium text-[var(--status-good)]">Settled</span>
            </>
          ) : (
            <span>
              {formatMoney(debt.balance_minor, currency)} of {formatMoney(debt.principal_minor, currency)} left
              {debt.due_date && ` · due ${formatDate(debt.due_date)}`}
            </span>
          )}
        </div>
      </button>

      {!isSettled && (
        <button
          type="button"
          onClick={onLogPayment}
          className="self-start text-xs font-medium text-primary hover:underline"
        >
          Log a payment
        </button>
      )}
    </div>
  )
}
