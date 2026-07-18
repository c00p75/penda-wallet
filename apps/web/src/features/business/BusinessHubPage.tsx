import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Briefcase, CalendarClock, Landmark, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { AiInsight } from '@/components/AiInsight'
import { formatMoney } from '@/lib/money'
import { localDateStr, localMonthPrefix } from '@/lib/dates'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { useDebts } from '@/features/debts/hooks'
import { useProfile, useUpdateProfile } from '@/features/profile/hooks'

export function BusinessHubPage() {
  const session = useAuthStore((s) => s.session)
  const userId = session?.user.id
  const { data: wallet } = useCurrentWallet()
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: debts = [] } = useDebts(wallet?.id)
  const { data: profile } = useProfile(userId)
  const updateProfile = useUpdateProfile(userId)

  const [taxPct, setTaxPct] = useState<string | null>(null)

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const currency = wallet.base_currency
  const now = new Date()
  const monthPrefix = localMonthPrefix(now)

  const monthTx = transactions.filter((tx) => tx.transaction_date.startsWith(monthPrefix))
  const monthIncome = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount_minor, 0)
  const monthExpense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount_minor, 0)
  const profit = monthIncome - monthExpense

  const balance = transactions.reduce(
    (sum, tx) => sum + (tx.type === 'income' ? tx.amount_minor : tx.type === 'expense' ? -tx.amount_minor : 0),
    0,
  )

  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffStr = localDateStr(cutoff)
  const last30Expense = transactions
    .filter((tx) => tx.type === 'expense' && tx.transaction_date >= cutoffStr)
    .reduce((s, tx) => s + tx.amount_minor, 0)
  const avgDailyBurn = last30Expense / 30
  const runwayDays = avgDailyBurn > 0 ? Math.floor(Math.max(0, balance) / avgDailyBurn) : null

  const receivables = debts.filter((d) => d.direction === 'owed_to_me' && d.balance_minor > 0)
  const arTotal = receivables.reduce((s, d) => s + d.balance_minor, 0)

  const reservePct = profile?.tax_reserve_pct ?? 0
  const taxSetAside = Math.round((monthIncome * Number(reservePct)) / 100)
  const taxDraft = taxPct ?? String(reservePct)

  const isBusiness = profile?.mode === 'business'

  async function saveTaxPct() {
    const n = Number(taxDraft)
    if (Number.isNaN(n) || n < 0 || n > 50) {
      toast.error('Tax reserve must be between 0 and 50%.')
      return
    }
    try {
      await updateProfile.mutateAsync({ tax_reserve_pct: n })
      setTaxPct(null)
      toast('Tax reserve updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  let insight: string
  if (profit >= 0) {
    insight = `This month you’re up ${formatMoney(profit, currency)} after expenses.`
  } else {
    insight = `This month you’re ${formatMoney(-profit, currency)} in the red — worth a look at burn and receivables.`
  }
  if (runwayDays != null) {
    insight +=
      runwayDays > 60
        ? ` Cash runway looks comfortable (~${runwayDays} days).`
        : runwayDays > 0
          ? ` At recent burn, cash lasts about ${runwayDays} days.`
          : ' Cash runway is effectively zero at recent burn.'
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 bg-background p-4 pb-24">
      <AppHeader />

      <div className="flex items-center gap-2">
        <Briefcase className="size-5 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Business hub</h1>
          <p className="text-sm text-muted-foreground">
            {isBusiness ? 'Side-hustle lite — profit, runway, AR, tax' : 'Most useful in Business mode — always available'}
          </p>
        </div>
      </div>

      <AiInsight>{insight}</AiInsight>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Period profit</p>
          <p
            className="mt-1 text-xl font-bold tabular-nums"
            style={{ color: profit >= 0 ? 'var(--mint)' : 'var(--rose)' }}
          >
            {formatMoney(profit, currency)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatMoney(monthIncome, currency)} in − {formatMoney(monthExpense, currency)} out
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock className="size-3.5" /> Cash runway
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {runwayDays == null ? '—' : `${runwayDays}d`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Burn {formatMoney(Math.round(avgDailyBurn), currency)}/day
          </p>
        </div>
      </div>

      <section className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-medium">
            <Receipt className="size-4 text-muted-foreground" />
            Accounts receivable
          </h2>
          <span className="text-sm font-semibold tabular-nums">{formatMoney(arTotal, currency)}</span>
        </div>
        {receivables.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing owed to you right now.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {receivables.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{d.counterparty || d.name}</span>
                <span className="shrink-0 font-medium tabular-nums">{formatMoney(d.balance_minor, currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-1.5 font-medium">
          <Landmark className="size-4 text-muted-foreground" />
          Tax set-aside
        </h2>
        <p className="text-sm text-muted-foreground">
          Suggested reserve this month:{' '}
          <span className="font-semibold text-foreground">{formatMoney(taxSetAside, currency)}</span>
          {reservePct > 0 ? ` (${reservePct}% of income)` : ' — set a % below'}
        </p>
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="tax-pct">Reserve %</Label>
            <Input
              id="tax-pct"
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={taxDraft}
              onChange={(e) => setTaxPct(e.target.value)}
            />
          </div>
          <Button
            onClick={saveTaxPct}
            disabled={updateProfile.isPending || taxDraft === String(reservePct)}
          >
            Save
          </Button>
        </div>
      </section>

      <BottomNav />
    </main>
  )
}
