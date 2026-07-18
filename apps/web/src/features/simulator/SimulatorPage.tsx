import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { MagicWand } from '@/components/icons/product'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HeroCard } from '@/components/ui/hero-card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AiInsight } from '@/components/AiInsight'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'
import { formatMoney, toMinorUnits } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { useRecurringTransactions } from '@/features/recurring/hooks'
import { useDebts } from '@/features/debts/hooks'
import type { ProjectCashflowInput } from '@/features/cashflow/projection'
import { projectDebtPayoff, simulateScenario } from './simulate'

const HORIZON_DAYS = 30

function fmtDay(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

export function SimulatorPage() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: recurring = [] } = useRecurringTransactions(wallet?.id)
  const { data: debts = [] } = useDebts(wallet?.id)

  const [purchase, setPurchase] = useState('')
  const [cutPct, setCutPct] = useState(0)
  const payableDebts = useMemo(() => debts.filter((d) => d.direction === 'i_owe' && d.balance_minor > 0), [debts])
  const [selectedDebtId, setSelectedDebtId] = useState('')
  const [extraPayment, setExtraPayment] = useState('')

  const base: ProjectCashflowInput = useMemo(() => {
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const balance = transactions.reduce(
      (sum, tx) => sum + (tx.type === 'income' ? (tx.converted_amount_minor ?? tx.amount_minor) : tx.type === 'expense' ? -(tx.converted_amount_minor ?? tx.amount_minor) : 0),
      0,
    )
    const cutoff = new Date(from)
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const discretionary = transactions
      .filter((tx) => tx.type === 'expense' && tx.source !== 'recurring' && tx.transaction_date >= cutoffStr)
      .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)
    return {
      startingBalanceMinor: balance,
      recurring,
      avgDailySpendMinor: Math.round(discretionary / 30),
      from,
      days: HORIZON_DAYS,
    }
  }, [transactions, recurring])

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const currency = wallet.base_currency
  const oneOffMinor = toMinorUnits(Number(purchase) || 0)
  const extraDebtPaymentMinor = toMinorUnits(Number(extraPayment) || 0)
  const result = simulateScenario(base, { oneOffMinor, spendCutPct: cutPct, extraDebtPaymentMinor })
  const { scenario, endDeltaMinor, canAfford } = result

  const selectedDebt = payableDebts.find((d) => d.id === selectedDebtId) ?? null
  const payoff =
    selectedDebt && extraDebtPaymentMinor > 0
      ? projectDebtPayoff({
          balanceMinor: selectedDebt.balance_minor,
          annualRatePct: selectedDebt.interest_rate,
          extraMonthlyMinor: extraDebtPaymentMinor,
        })
      : null

  let verdict: { tone: 'default' | 'warm' | 'attention'; text: string } | null = null
  if (oneOffMinor > 0) {
    verdict = canAfford
      ? {
          tone: 'default',
          text: `Yes, you can handle this. Your lowest point would be ${formatMoney(scenario.lowestBalance.balanceMinor, currency)} on ${fmtDay(scenario.lowestBalance.date)}.`,
        }
      : {
          tone: 'attention',
          text: `Future you might regret this. It would pull you down to ${formatMoney(scenario.lowestBalance.balanceMinor, currency)} by ${fmtDay(scenario.lowestBalance.date)}.`,
        }
  } else if (payoff) {
    verdict = payoff.monthsToPayoff === null
      ? {
          tone: 'attention',
          text: `That payment doesn't even cover the interest building up on "${selectedDebt!.name}", it would never actually shrink.`,
        }
      : !canAfford
        ? {
            tone: 'attention',
            text: `That's tight, it would pull this month's balance down to ${formatMoney(scenario.lowestBalance.balanceMinor, currency)}.`,
          }
        : {
            tone: 'default',
            text: `"${selectedDebt!.name}" would be paid off in ${payoff.monthsToPayoff} month${payoff.monthsToPayoff === 1 ? '' : 's'}, ${payoff.totalInterestMinor! > 0 ? `costing about ${formatMoney(payoff.totalInterestMinor!, currency)} in interest.` : 'with no interest.'}`,
          }
  }

  const endBalance = scenario.days.at(-1)?.balanceMinor ?? 0
  const heroTone = scenario.lowestBalance.balanceMinor < 0 ? 'rose' : canAfford === false ? 'apricot' : 'iris'

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader title="What if…" subtitle="Ask the future out loud" />

      <HeroCard tone={heroTone} className="w-full min-h-[8.5rem]">
        <div className="flex w-full items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/85">Balance in {HORIZON_DAYS} days</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              <HiddenAmount>{formatMoney(endBalance, currency)}</HiddenAmount>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-white/75">Lowest point</p>
            <p
              className={cn(
                'mt-1 text-lg font-semibold tabular-nums',
                scenario.lowestBalance.balanceMinor < 0 ? 'text-white' : 'text-white/90',
              )}
            >
              <HiddenAmount>{formatMoney(scenario.lowestBalance.balanceMinor, currency)}</HiddenAmount>
            </p>
          </div>
        </div>
      </HeroCard>

      {verdict ? (
        <AiInsight tone={verdict.tone}>{verdict.text}</AiInsight>
      ) : (
        <AiInsight>Try me, put in a purchase or slide to cut spending, and I'll show the ripple.</AiInsight>
      )}

      <div className="flex flex-col gap-2 rounded-[1.35rem] bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border/50">
        <Label htmlFor="purchase" className="flex items-center gap-2">
          <MagicWand className="size-4 text-[var(--iris)]" weight="duotone" />
          Can I buy this?
        </Label>
        <Input
          id="purchase"
          type="number"
          inputMode="decimal"
          min="0"
          value={purchase}
          onChange={(e) => setPurchase(e.target.value)}
          placeholder={`Price in ${currency}`}
          className="rounded-2xl"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-[1.35rem] bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border/50">
        <div className="flex items-center justify-between">
          <Label htmlFor="cut">Cut everyday spending by</Label>
          <span className="text-sm font-semibold text-[var(--iris)]">{cutPct}%</span>
        </div>
        <input
          id="cut"
          type="range"
          min={0}
          max={50}
          step={5}
          value={cutPct}
          onChange={(e) => setCutPct(Number(e.target.value))}
          className="w-full accent-[var(--primary)]"
        />
        {cutPct > 0 && (
          <p className="text-sm text-muted-foreground">
            That frees up about{' '}
            <span className="font-semibold text-foreground">{formatMoney(Math.max(0, endDeltaMinor), currency)}</span>{' '}
            over the next {HORIZON_DAYS} days.
          </p>
        )}
      </div>

      {payableDebts.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[1.35rem] bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border/50">
          <Label className="flex items-center gap-2">
            <MagicWand className="size-4 text-[var(--iris)]" weight="duotone" />
            Pay off a debt faster
          </Label>
          <Select value={selectedDebtId} onValueChange={setSelectedDebtId}>
            <SelectTrigger className="w-full rounded-2xl">
              <SelectValue placeholder="Choose a debt" />
            </SelectTrigger>
            <SelectContent>
              {payableDebts.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}, {formatMoney(d.balance_minor, currency)} left
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedDebtId && (
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              value={extraPayment}
              onChange={(e) => setExtraPayment(e.target.value)}
              placeholder={`Extra per month in ${currency}`}
              className="rounded-2xl"
            />
          )}
        </div>
      )}

      <BottomNav />
    </main>
  )
}
