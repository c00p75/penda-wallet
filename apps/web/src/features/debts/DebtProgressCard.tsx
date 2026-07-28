import { Plus } from 'lucide-react'
import { ArrowDownLeft, ArrowUpRight } from '@/components/icons/product'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cardAccentClass } from '@/components/ui/cardAccent'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { debtDueUrgency } from './dueDate'
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
  })
}

function dueLabel(debt: Debt): { text: string; className: string } | null {
  if (debt.balance_minor <= 0 || !debt.due_date) return null
  const urgency = debtDueUrgency(debt)
  const when = formatDate(debt.due_date)
  if (urgency === 'overdue') {
    return { text: `Overdue · was due ${when}`, className: 'text-[var(--rose)]' }
  }
  if (urgency === 'due_today') {
    return { text: 'Due today', className: 'text-[var(--rose)]' }
  }
  if (urgency === 'due_soon') {
    return { text: `Due ${when}`, className: 'text-amber-700 dark:text-amber-400' }
  }
  return { text: `Due ${when}`, className: 'text-muted-foreground' }
}

export function DebtProgressCard({ debt, currency, onSelect, onLogPayment }: DebtProgressCardProps) {
  const isSettled = debt.balance_minor <= 0
  const paidOff = debt.principal_minor > 0 ? 1 - Math.max(debt.balance_minor, 0) / debt.principal_minor : 0
  // A settled debt reads as 100% paid even if its principal was never recorded
  // (or got edited to 0), so the bar shows "cleared" instead of sitting empty.
  const paidPct = isSettled ? 100 : Math.round(Math.min(Math.max(paidOff, 0), 1) * 100)
  const iOwe = debt.direction === 'i_owe'
  const DirectionIcon = iOwe ? ArrowUpRight : ArrowDownLeft
  const urgency = debtDueUrgency(debt)
  const accent =
    isSettled ? 'mint' : urgency === 'overdue' || urgency === 'due_today' ? 'rose' : iOwe ? 'rose' : 'mint'
  const due = dueLabel(debt)

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[1.5rem] bg-card p-4 shadow-[var(--shadow-soft)]',
        cardAccentClass(accent),
      )}
    >
      <button type="button" onClick={onSelect} className="flex flex-col gap-3 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-2xl',
                isSettled
                  ? 'bg-[var(--mint-soft)] text-[var(--mint)]'
                  : urgency === 'overdue' || urgency === 'due_today'
                    ? 'bg-[var(--rose-soft)] text-[var(--rose)]'
                    : iOwe
                      ? 'bg-[var(--rose-soft)] text-[var(--rose)]'
                      : 'bg-[var(--mint-soft)] text-[var(--mint)]',
              )}
            >
              <DirectionIcon className="size-5" weight="bold" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{debt.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isSettled ? 'Settled' : iOwe ? 'You owe' : 'Owed to you'}
                {debt.counterparty ? ` · ${debt.counterparty}` : ''}
              </p>
              {due && <p className={cn('mt-0.5 text-xs font-medium', due.className)}>{due.text}</p>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-bold tabular-nums">
              <HiddenAmount>{formatMoney(Math.max(debt.balance_minor, 0), currency)}</HiddenAmount>
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {isSettled ? 'cleared' : 'left'}
            </p>
          </div>
        </div>

        <div>
          <Progress
            value={paidPct}
            className="h-1.5"
            indicatorClassName={isSettled ? 'bg-[var(--mint)]' : iOwe ? 'bg-[var(--rose)]' : 'bg-[var(--mint)]'}
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {paidPct}% paid
            {' · '}
            of <HiddenAmount>{formatMoney(debt.principal_minor, currency)}</HiddenAmount> principal
          </p>
        </div>
      </button>

      {!isSettled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onLogPayment}
          className="w-full gap-1.5 font-semibold"
        >
          <Plus className="size-4" />
          Log a payment
        </Button>
      )}
    </div>
  )
}
