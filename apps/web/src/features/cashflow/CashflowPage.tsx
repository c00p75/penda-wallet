import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { HeroCard } from '@/components/ui/hero-card'
import { DateChip } from '@/components/ui/date-chip'
import { SectionHeader } from '@/components/ui/section-header'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { AiInsight } from '@/components/AiInsight'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { useChatStore } from '@/features/chat/chatStore'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { useRecurringTransactions } from '@/features/recurring/hooks'
import { localDateStr } from '@/lib/dates'
import { projectCashflow, type ProjectedDay } from './projection'

const HORIZON_OPTIONS = [
  { value: '7', label: '7d' },
  { value: '14', label: '14d' },
  { value: '30', label: '30d' },
] as const

type Horizon = (typeof HORIZON_OPTIONS)[number]['value']

function formatDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function CashflowPage() {
  const session = useAuthStore((s) => s.session)
  const openChat = useChatStore((s) => s.openChat)
  const { data: wallet } = useCurrentWallet()
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: recurring = [] } = useRecurringTransactions(wallet?.id)
  const [horizon, setHorizon] = useState<Horizon>('30')
  const horizonDays = Number(horizon)

  const projection = useMemo(() => {
    const from = new Date()
    from.setHours(0, 0, 0, 0)

    const balance = transactions.reduce(
      (sum, tx) => sum + (tx.type === 'income' ? (tx.converted_amount_minor ?? tx.amount_minor) : tx.type === 'expense' ? -(tx.converted_amount_minor ?? tx.amount_minor) : 0),
      0,
    )

    const cutoff = new Date(from)
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = localDateStr(cutoff)
    const discretionary = transactions
      .filter((tx) => tx.type === 'expense' && tx.source !== 'recurring' && tx.transaction_date >= cutoffStr)
      .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)

    return projectCashflow({
      startingBalanceMinor: balance,
      recurring,
      avgDailySpendMinor: Math.round(discretionary / 30),
      from,
      days: horizonDays,
    })
  }, [transactions, recurring, horizonDays])

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const currency = wallet.base_currency
  const { nextIncome, freeBeforeNextIncomeMinor, lowestBalance } = projection
  const endBalance = projection.days.at(-1)?.balanceMinor ?? 0
  const heroTone =
    lowestBalance.balanceMinor < 0 ? 'rose' : freeBeforeNextIncomeMinor != null && freeBeforeNextIncomeMinor < 50000 ? 'apricot' : 'mint'

  let insight: { tone: 'default' | 'warm' | 'attention'; text: string }
  if (nextIncome && freeBeforeNextIncomeMinor !== null) {
    const paydayLabel = formatDay(nextIncome.date)
    if (freeBeforeNextIncomeMinor < 0) {
      insight = {
        tone: 'attention',
        text: `You're heading ${formatMoney(-freeBeforeNextIncomeMinor, currency)} short before ${paydayLabel}. Let's trim something to bridge it.`,
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
      text: `Your balance drifts to ${formatMoney(lowestBalance.balanceMinor, currency)} over the next ${horizonDays} days.`,
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader title="Cashflow" subtitle="Looking forward" />

      <DateChip
        value={horizon}
        onChange={(v) => setHorizon(v as Horizon)}
        options={HORIZON_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      />

      <HeroCard tone={heroTone} className="w-full min-h-[8.5rem]">
        <div className="flex w-full items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/85">Lowest projected balance</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              <HiddenAmount>{formatMoney(lowestBalance.balanceMinor, currency)}</HiddenAmount>
            </p>
            <p className="mt-1 text-sm text-white/80">{formatDay(lowestBalance.date)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-white/75">In {horizonDays} days</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white/90">
              <HiddenAmount>{formatMoney(endBalance, currency)}</HiddenAmount>
            </p>
          </div>
        </div>
      </HeroCard>

      <AiInsight featured tone={insight.tone} askText={insight.text}>
        {insight.text}
      </AiInsight>

      <div className="flex flex-wrap gap-2">
        {['When will I run short?', 'What if I cut spending by 20%?', 'How much free before payday?'].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => openChat(q, { autoSend: true })}
            className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)] hover:bg-accent/60 hover:text-foreground"
          >
            {q}
          </button>
        ))}
      </div>

      <section>
        <SectionHeader title="Timeline" />
        <ol className="relative flex flex-col gap-0 border-l border-border/60 pl-4">
          {projection.days.map((day) => (
            <TimelineRow key={day.date} day={day} currency={currency} isLowest={day.date === lowestBalance.date} />
          ))}
        </ol>
      </section>

      <BottomNav />
    </main>
  )
}

function TimelineRow({ day, currency, isLowest }: { day: ProjectedDay; currency: string; isLowest: boolean }) {
  const hasEvents = day.events.some((e) => e.kind !== 'spending')
  const negative = day.balanceMinor < 0

  return (
    <li className="relative flex items-start justify-between gap-3 rounded-[1.35rem] py-2.5">
      <span
        className={cn(
          'absolute -left-[1.3rem] top-3.5 size-2.5 rounded-full border-2 border-background',
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
