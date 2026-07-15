import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AiInsight } from '@/components/AiInsight'
import { cn } from '@/lib/utils'
import { formatMoney, toMinorUnits } from '@/lib/money'
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
  const navigate = useNavigate()
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
      (sum, tx) => sum + (tx.type === 'income' ? tx.amount_minor : tx.type === 'expense' ? -tx.amount_minor : 0),
      0,
    )
    const cutoff = new Date(from)
    cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const discretionary = transactions
      .filter((tx) => tx.type === 'expense' && tx.source !== 'recurring' && tx.transaction_date >= cutoffStr)
      .reduce((sum, tx) => sum + tx.amount_minor, 0)
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
          text: `Yes — you can handle this. Your lowest point would be ${formatMoney(scenario.lowestBalance.balanceMinor, currency)} on ${fmtDay(scenario.lowestBalance.date)}.`,
        }
      : {
          tone: 'attention',
          text: `Future you might regret this. It would pull you down to ${formatMoney(scenario.lowestBalance.balanceMinor, currency)} by ${fmtDay(scenario.lowestBalance.date)}.`,
        }
  } else if (payoff) {
    verdict = payoff.monthsToPayoff === null
      ? {
          tone: 'attention',
          text: `That payment doesn't even cover the interest building up on "${selectedDebt!.name}" — it would never actually shrink.`,
        }
      : !canAfford
        ? {
            tone: 'attention',
            text: `That's tight — it would pull this month's balance down to ${formatMoney(scenario.lowestBalance.balanceMinor, currency)}.`,
          }
        : {
            tone: 'default',
            text: `"${selectedDebt!.name}" would be paid off in ${payoff.monthsToPayoff} month${payoff.monthsToPayoff === 1 ? '' : 's'}, ${payoff.totalInterestMinor! > 0 ? `costing about ${formatMoney(payoff.totalInterestMinor!, currency)} in interest.` : 'with no interest.'}`,
          }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4 pb-24">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">What if…</h1>
          <p className="text-sm text-muted-foreground">Ask the future out loud</p>
        </div>
      </header>

      {verdict ? (
        <AiInsight tone={verdict.tone}>{verdict.text}</AiInsight>
      ) : (
        <AiInsight>Try me — put in a purchase or slide to cut spending, and I’ll show the ripple.</AiInsight>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
        <Label htmlFor="purchase" className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
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
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="cut">Cut everyday spending by</Label>
          <span className="text-sm font-semibold text-primary">{cutPct}%</span>
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
        <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
          <Label className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Pay off a debt faster
          </Label>
          <Select value={selectedDebtId} onValueChange={setSelectedDebtId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a debt" />
            </SelectTrigger>
            <SelectContent>
              {payableDebts.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} — {formatMoney(d.balance_minor, currency)} left
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
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Metric label="Balance in 30 days" value={formatMoney(scenario.days.at(-1)?.balanceMinor ?? 0, currency)} />
        <Metric
          label="Lowest point"
          value={formatMoney(scenario.lowestBalance.balanceMinor, currency)}
          alert={scenario.lowestBalance.balanceMinor < 0}
        />
      </div>
    </main>
  )
}

function Metric({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold', alert && 'text-rose-600 dark:text-rose-400')}>{value}</p>
    </div>
  )
}
