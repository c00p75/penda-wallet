import { useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BottomNav } from '@/components/BottomNav'
import { AiInsight } from '@/components/AiInsight'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { useRecurringTransactions } from '@/features/recurring/hooks'
import { projectCashflow, type ProjectedDay } from './projection'

const HORIZON_DAYS = 30

function formatDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

export function CashflowPage() {
  const session = useAuthStore((s) => s.session)
  const navigate = useNavigate()
  const { data: wallet } = useCurrentWallet()
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: recurring = [] } = useRecurringTransactions(wallet?.id)

  const projection = useMemo(() => {
    const from = new Date()
    from.setHours(0, 0, 0, 0)

    // Current balance = all-time confirmed income minus expenses.
    const balance = transactions.reduce(
      (sum, tx) => sum + (tx.type === 'income' ? tx.amount_minor : tx.type === 'expense' ? -tx.amount_minor : 0),
      0,
    )

    // Everyday spend = discretionary only (exclude auto-posted recurring bills,
    // which the projection adds separately) over the last 30 days.
    const cutoff = new Date(from)
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const discretionary = transactions
      .filter((tx) => tx.type === 'expense' && tx.source !== 'recurring' && tx.transaction_date >= cutoffStr)
      .reduce((sum, tx) => sum + tx.amount_minor, 0)

    return projectCashflow({
      startingBalanceMinor: balance,
      recurring,
      avgDailySpendMinor: Math.round(discretionary / 30),
      from,
      days: HORIZON_DAYS,
    })
  }, [transactions, recurring])

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const currency = wallet.base_currency
  const { nextIncome, freeBeforeNextIncomeMinor, lowestBalance } = projection

  let insight: { tone: 'default' | 'warm' | 'attention'; text: string }
  if (nextIncome && freeBeforeNextIncomeMinor !== null) {
    const paydayLabel = formatDay(nextIncome.date)
    if (freeBeforeNextIncomeMinor < 0) {
      insight = {
        tone: 'attention',
        text: `You’re heading ${formatMoney(-freeBeforeNextIncomeMinor, currency)} short before ${paydayLabel}. Let’s trim something to bridge it.`,
      }
    } else {
      insight = {
        tone: freeBeforeNextIncomeMinor < 50000 ? 'warm' : 'default',
        text: `You have ${formatMoney(freeBeforeNextIncomeMinor, currency)} free to spend before ${paydayLabel}.`,
      }
    }
  } else if (lowestBalance.balanceMinor < 0) {
    insight = {
      tone: 'attention',
      text: `Without income coming in, your balance dips to ${formatMoney(lowestBalance.balanceMinor, currency)} by ${formatDay(lowestBalance.date)}.`,
    }
  } else {
    insight = {
      tone: 'default',
      text: `Your balance drifts to ${formatMoney(lowestBalance.balanceMinor, currency)} over the next ${HORIZON_DAYS} days.`,
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 bg-background p-4 pb-24">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Cashflow timeline</h1>
          <p className="text-sm text-muted-foreground">The next {HORIZON_DAYS} days, looking forward</p>
        </div>
      </header>

      <AiInsight tone={insight.tone}>{insight.text}</AiInsight>

      <ol className="relative flex flex-col gap-0 border-l border-border pl-4">
        {projection.days.map((day) => (
          <TimelineRow key={day.date} day={day} currency={currency} isLowest={day.date === lowestBalance.date} />
        ))}
      </ol>

      <BottomNav />
    </main>
  )
}

function TimelineRow({ day, currency, isLowest }: { day: ProjectedDay; currency: string; isLowest: boolean }) {
  const hasEvents = day.events.some((e) => e.kind !== 'spending')
  const negative = day.balanceMinor < 0

  return (
    <li className="relative flex items-start justify-between gap-3 py-2">
      <span
        className={cn(
          'absolute -left-[1.3rem] top-3 size-2.5 rounded-full border-2 border-background',
          negative ? 'bg-[var(--rose)]' : hasEvents ? 'bg-primary' : 'bg-muted-foreground/40',
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', hasEvents ? 'font-medium' : 'text-muted-foreground')}>{formatDay(day.date)}</p>
        {hasEvents && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {day.events
              .filter((e) => e.kind !== 'spending')
              .map((e, i) => (
                <span
                  key={i}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    e.kind === 'income'
                      ? 'bg-[var(--mint-soft)] text-[var(--mint)]'
                      : 'bg-[var(--rose-soft)] text-[var(--rose)]',
                  )}
                >
                  {e.amountMinor > 0 ? '+' : ''}
                  {formatMoney(e.amountMinor, currency)} · {e.label}
                </span>
              ))}
          </div>
        )}
      </div>
      <span
        className={cn(
          'shrink-0 text-sm tabular-nums',
          negative ? 'font-semibold text-[var(--rose)]' : isLowest ? 'font-semibold text-[var(--apricot)]' : 'text-muted-foreground',
        )}
      >
        {formatMoney(day.balanceMinor, currency)}
      </span>
    </li>
  )
}
