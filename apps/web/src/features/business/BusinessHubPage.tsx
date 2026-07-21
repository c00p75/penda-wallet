import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Bank, ClockCountdown, Receipt } from '@/components/icons/product'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HeroCard } from '@/components/ui/hero-card'
import { IconTile } from '@/components/ui/icon-tile'
import { SectionHeader } from '@/components/ui/section-header'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { AiInsight } from '@/components/AiInsight'
import { formatMoney } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
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
  const today = localDateStr(now)
  function arBucket(due: string | null): 'current' | 'due_soon' | 'overdue' {
    if (!due) return 'current'
    if (due < today) return 'overdue'
    const soon = new Date(now)
    soon.setDate(soon.getDate() + 7)
    if (due <= localDateStr(soon)) return 'due_soon'
    return 'current'
  }
  const arAging = {
    current: receivables.filter((d) => arBucket(d.due_date) === 'current'),
    due_soon: receivables.filter((d) => arBucket(d.due_date) === 'due_soon'),
    overdue: receivables.filter((d) => arBucket(d.due_date) === 'overdue'),
  }
  const topCustomers = [...receivables]
    .sort((a, b) => b.balance_minor - a.balance_minor)
    .slice(0, 5)

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
    insight = `This month you're up ${formatMoney(profit, currency)} after expenses.`
  } else {
    insight = `This month you're ${formatMoney(-profit, currency)} in the red, worth a look at burn and receivables.`
  }
  if (runwayDays != null) {
    insight +=
      runwayDays > 60
        ? ` Cash runway looks comfortable (~${runwayDays} days).`
        : runwayDays > 0
          ? ` At recent burn, cash lasts about ${runwayDays} days.`
          : ' Cash runway is effectively zero at recent burn.'
  }

  const monthLabel = now.toLocaleDateString(undefined, { month: 'long' })

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader
        title="Business hub"
        subtitle={
          isBusiness ? `${monthLabel} · profit, runway, AR, tax` : 'Most useful in Business mode, always available'
        }
      />

      <HeroCard tone={profit >= 0 ? 'iris' : 'rose'} className="w-full min-h-[8.5rem]">
        <div>
          <p className="text-sm font-medium text-white/85">Period profit</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">
            <HiddenAmount>{formatMoney(profit, currency)}</HiddenAmount>
          </p>
          <p className="mt-1 text-sm text-white/80">
            <HiddenAmount>{formatMoney(monthIncome, currency)}</HiddenAmount> in −{' '}
            <HiddenAmount>{formatMoney(monthExpense, currency)}</HiddenAmount> out
          </p>
        </div>
      </HeroCard>

      <AiInsight featured>{insight}</AiInsight>

      <div className="grid grid-cols-2 gap-3">
        <IconTile
          icon={ClockCountdown}
          label="Cash runway"
          tone="iris"
          className="col-span-1"
        >
          <p className="text-lg font-bold tabular-nums">{runwayDays == null ? '···' : `${runwayDays}d`}</p>
          <p className="text-[11px] text-muted-foreground">
            Burn {formatMoney(Math.round(avgDailyBurn), currency)}/day
          </p>
        </IconTile>
        <IconTile icon={Receipt} label="Receivables" tone="rose" className="col-span-1">
          <p className="text-lg font-bold tabular-nums">
            <HiddenAmount>{formatMoney(arTotal, currency)}</HiddenAmount>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {receivables.length} open
          </p>
        </IconTile>
      </div>

      <section className="rounded-[1.35rem] bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border/50">
        <SectionHeader title="Accounts receivable" className="mb-3" />
        {receivables.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing owed to you right now.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  ['current', 'Current', arAging.current],
                  ['due_soon', '≤7d', arAging.due_soon],
                  ['overdue', 'Overdue', arAging.overdue],
                ] as const
              ).map(([key, label, rows]) => (
                <div key={key} className="rounded-2xl bg-muted/40 px-2 py-2">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    <HiddenAmount>
                      {formatMoney(
                        rows.reduce((s, d) => s + d.balance_minor, 0),
                        currency,
                      )}
                    </HiddenAmount>
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs font-medium text-muted-foreground">Top customers</p>
            <ul className="flex flex-col gap-2">
              {topCustomers.map((d) => {
                const bucket = arBucket(d.due_date)
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded-2xl bg-muted/40 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="truncate block">{d.counterparty || d.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {bucket === 'overdue'
                          ? 'Overdue'
                          : bucket === 'due_soon'
                            ? `Due ${d.due_date}`
                            : d.due_date
                              ? `Due ${d.due_date}`
                              : 'No due date'}
                      </span>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">
                      <HiddenAmount>{formatMoney(d.balance_minor, currency)}</HiddenAmount>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-[1.35rem] bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border/50">
        <SectionHeader
          title={
            <span className="flex items-center gap-1.5">
              <Bank className="size-4 text-muted-foreground" weight="duotone" />
              Tax set-aside
            </span>
          }
          className="mb-3"
        />
        <p className="text-sm text-muted-foreground">
          Suggested reserve this month:{' '}
          <span className="font-semibold text-foreground">
            <HiddenAmount>{formatMoney(taxSetAside, currency)}</HiddenAmount>
          </span>
          {reservePct > 0 ? ` (${reservePct}% of income)` : ', set a % below'}
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
              className="rounded-2xl"
            />
          </div>
          <Button
            onClick={saveTaxPct}
            disabled={updateProfile.isPending || taxDraft === String(reservePct)}
            className="rounded-full"
          >
            Save
          </Button>
        </div>
      </section>

      <BottomNav />
    </main>
  )
}
