import { Plus } from 'lucide-react'
import { ArrowDownLeft, ArrowUpRight } from '@/components/icons/product'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cardAccentClass } from '@/components/ui/cardAccent'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
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

export function DebtProgressCard({ debt, currency, onSelect, onLogPayment }: DebtProgressCardProps) {
  const isSettled = debt.balance_minor <= 0
  const paidOff = debt.principal_minor > 0 ? 1 - Math.max(debt.balance_minor, 0) / debt.principal_minor : 0
  // A settled debt reads as 100% paid even if its principal was never recorded
  // (or got edited to 0), so the bar shows "cleared" instead of sitting empty.
  const paidPct = isSettled ? 100 : Math.round(Math.min(Math.max(paidOff, 0), 1) * 100)
  const iOwe = debt.direction === 'i_owe'
  const DirectionIcon = iOwe ? ArrowUpRight : ArrowDownLeft
  const accent = isSettled ? 'mint' : iOwe ? 'rose' : 'mint'

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
                {!isSettled && debt.due_date ? ` · due ${formatDate(debt.due_date)}` : ''}
              </p>
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
