import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bell, BellRinging, Sparkle } from '@/components/icons/product'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DateChip } from '@/components/ui/date-chip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { useBudgetProgress } from '@/features/budgets/hooks'
import { useSavingsGoals } from '@/features/goals/hooks'
import { usePushSubscriptionStatus, useSubscribeToPush } from '@/features/notifications/hooks'
import { useEntitlement } from '@/features/entitlements/hooks'
import { FEATURE_COPY } from '@/features/entitlements/types'
import { formatMoney } from '@/lib/money'
import { AiInsight } from '@/components/AiInsight'
import { useDismissInsight, useInsights } from './hooks'
import { CategoryBarChart } from './CategoryBarChart'
import { CashflowSummary } from './CashflowSummary'
import { CashflowTrendChart } from './CashflowTrendChart'
import { SpendingCalendar } from './SpendingCalendar'
import { InsightsList } from './InsightsList'
import { CONFIDENCE_LABEL_COPY, computeConfidenceScore } from './confidenceScore'
import { bucketCashflow, filterByRange, sumByType } from './aggregate'
import { type AnalyticsPeriod, PERIOD_OPTIONS, bucketGranularityFor, periodRange, previousPeriodRange } from './period'

export function AnalyticsPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24">
      <AppHeader />
      <section>
        <h1 className="text-[2rem] font-bold tracking-tight leading-tight">Insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">Patterns, confidence, and what Penda notices</p>
      </section>
      <AnalyticsContent />
      <BottomNav />
    </main>
  )
}

/** The analytics body used by the standalone Analytics page. */
export function AnalyticsContent() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: budgetProgress = [] } = useBudgetProgress(wallet?.id)
  const { data: goals = [] } = useSavingsGoals(wallet?.id)
  const { data: insights = [] } = useInsights(wallet?.id)
  const dismissInsight = useDismissInsight(wallet?.id)
  const { data: isSubscribed } = usePushSubscriptionStatus()
  const subscribeToPush = useSubscribeToPush()
  const { isPremium } = useEntitlement(session?.user.id)
  const [period, setPeriod] = useState<AnalyticsPeriod>('6m')
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>('expense')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [highlightInsightId] = useState(() => searchParams.get('insight'))

  // A recap notification landed here with ?insight= pointing at the card to
  // show; drop the param once captured so it doesn't linger in the URL.
  useEffect(() => {
    if (!searchParams.get('insight')) return
    const params = new URLSearchParams(searchParams)
    params.delete('insight')
    setSearchParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const now = new Date()
  const monthTransactions = transactions.filter((tx) => {
    const d = new Date(`${tx.transaction_date}T00:00:00`)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const monthIncomeMinor = monthTransactions
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)
  const monthExpenseMinor = monthTransactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)
  const balanceMinor = transactions.reduce(
    (sum, tx) => sum + (tx.type === 'income' ? (tx.converted_amount_minor ?? tx.amount_minor) : tx.type === 'expense' ? -(tx.converted_amount_minor ?? tx.amount_minor) : 0),
    0,
  )
  const goalProgressAvg =
    goals.length === 0
      ? 0.5
      : goals.reduce(
          (sum, g) =>
            sum + (g.target_amount_minor > 0 ? Math.min(1, g.current_amount_minor / g.target_amount_minor) : 0),
          0,
        ) / goals.length
  const budgetAdherence =
    budgetProgress.length === 0
      ? 0.5
      : budgetProgress.reduce((sum, b) => {
          const cap = b.effective_amount_minor
          if (cap <= 0) return sum + 1
          return sum + Math.max(0, 1 - b.spent_minor / cap)
        }, 0) / budgetProgress.length
  const confidence = computeConfidenceScore({
    balanceMinor,
    monthIncomeMinor,
    monthExpenseMinor,
    goalProgressAvg,
    budgetAdherence,
  })

  const range = periodRange(period, now)
  const previousRange = previousPeriodRange(period, now)
  const periodTransactions = filterByRange(transactions, range)
  const previousPeriodTransactions = filterByRange(transactions, previousRange)
  const periodIncomeMinor = sumByType(periodTransactions, 'income')
  const periodExpenseMinor = sumByType(periodTransactions, 'expense')
  const previousIncomeMinor = sumByType(previousPeriodTransactions, 'income')
  const previousExpenseMinor = sumByType(previousPeriodTransactions, 'expense')
  const trendBuckets = bucketCashflow(periodTransactions, range, bucketGranularityFor(period))

  async function handleEnableNotifications() {
    if (!session) return
    try {
      await subscribeToPush.mutateAsync(session.user.id)
      toast('Weekly insight notifications enabled.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not enable notifications.')
    }
  }

  if (!wallet) return null

  // AI speaks first: lead with the newest insight (Premium) or, failing that, a
  // grounded fact computed from this month's own data, never a fabricated line.
  const latestInsight = isPremium ? insights[0] : undefined
  const monthSpentMinor = monthExpenseMinor
  const askText = latestInsight
    ? latestInsight.content.text
    : monthSpentMinor > 0
      ? `I've spent ${formatMoney(monthSpentMinor, wallet.base_currency)} so far this month`
      : 'I have no spending logged this month yet'

  return (
    <>
      <AiInsight
        featured
        tone={latestInsight?.type === 'anomaly' ? 'attention' : 'default'}
        askText={askText}
      >
        {latestInsight ? (
          latestInsight.content.text
        ) : monthSpentMinor > 0 ? (
          <>
            You’ve spent{' '}
            <b className="font-semibold">{formatMoney(monthSpentMinor, wallet.base_currency)}</b> so far
            this month. Here’s where it went.
          </>
        ) : (
          <>No spending logged this month yet, add a few and I’ll start spotting patterns for you.</>
        )}
      </AiInsight>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold tracking-tight">Financial confidence</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div
            className="grid size-16 place-items-center rounded-full text-xl font-bold tabular-nums"
            style={{
              background: 'var(--iris-soft)',
              color: 'var(--iris)',
            }}
          >
            {confidence.score}
          </div>
          <div>
            <p className="font-medium">{CONFIDENCE_LABEL_COPY[confidence.label]}</p>
            <p className="text-sm text-muted-foreground">
              From cash position, this month’s flow, goals, and budget pace, not a credit score.
            </p>
          </div>
        </CardContent>
      </Card>

      <DateChip value={period} onChange={(v) => setPeriod(v as AnalyticsPeriod)} options={PERIOD_OPTIONS} />

      <CashflowSummary
        currency={wallet.base_currency}
        incomeMinor={periodIncomeMinor}
        expenseMinor={periodExpenseMinor}
        previousIncomeMinor={previousIncomeMinor}
        previousExpenseMinor={previousExpenseMinor}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold tracking-tight">Income vs. expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <CashflowTrendChart buckets={trendBuckets} currency={wallet.base_currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold tracking-tight">By category</CardTitle>
          <ToggleGroup
            type="single"
            value={categoryType}
            onValueChange={(v) => v && setCategoryType(v as 'expense' | 'income')}
          >
            <ToggleGroupItem value="expense" size="sm">
              Expenses
            </ToggleGroupItem>
            <ToggleGroupItem value="income" size="sm">
              Income
            </ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          <CategoryBarChart
            transactions={periodTransactions}
            currency={wallet.base_currency}
            type={categoryType}
            color={categoryType === 'expense' ? 'var(--viz-expense)' : 'var(--viz-income)'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold tracking-tight">Daily spending</CardTitle>
          <CardDescription>This calendar always shows the current month.</CardDescription>
        </CardHeader>
        <CardContent>
          <SpendingCalendar
            transactions={monthTransactions}
            currency={wallet.base_currency}
            year={now.getFullYear()}
            month={now.getMonth()}
            onDayClick={(date) => navigate(`/transactions?date=${date}`)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold tracking-tight">Insights</CardTitle>
          {isPremium && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={handleEnableNotifications}
              disabled={isSubscribed || subscribeToPush.isPending}
            >
              {isSubscribed ? (
                <BellRinging className="size-4" weight="duotone" />
              ) : (
                <Bell className="size-4" weight="duotone" />
              )}
              {isSubscribed ? 'Enabled' : 'Enable alerts'}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isPremium ? (
            <InsightsList
              insights={insights}
              onDismiss={(id) => dismissInsight.mutate(id)}
              highlightId={highlightInsightId}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Sparkle className="size-6 text-primary" weight="duotone" />
              <p className="text-sm font-medium">{FEATURE_COPY.insights.title}</p>
              <p className="text-sm text-muted-foreground">{FEATURE_COPY.insights.description}</p>
              <p className="text-xs text-muted-foreground">Premium isn't available to purchase yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
