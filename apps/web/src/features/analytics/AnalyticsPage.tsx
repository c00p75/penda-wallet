import { Bell, BellRinging, Sparkle } from '@/components/icons/product'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { SpendingCalendar } from './SpendingCalendar'
import { InsightsList } from './InsightsList'
import { CONFIDENCE_LABEL_COPY, computeConfidenceScore } from './confidenceScore'

export function AnalyticsPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24">
      <AppHeader />
      <section>
        <h1 className="text-[2rem] font-bold tracking-tight leading-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Patterns, confidence, and insights</p>
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

  const now = new Date()
  const monthTransactions = transactions.filter((tx) => {
    const d = new Date(`${tx.transaction_date}T00:00:00`)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const monthIncomeMinor = monthTransactions
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount_minor, 0)
  const monthExpenseMinor = monthTransactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount_minor, 0)
  const balanceMinor = transactions.reduce(
    (sum, tx) => sum + (tx.type === 'income' ? tx.amount_minor : tx.type === 'expense' ? -tx.amount_minor : 0),
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
  // grounded fact computed from this month's own data — never a fabricated line.
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
          <>No spending logged this month yet — add a few and I’ll start spotting patterns for you.</>
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
              From cash position, this month’s flow, goals, and budget pace — not a credit score.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold tracking-tight">This month by category</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryBarChart transactions={monthTransactions} currency={wallet.base_currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold tracking-tight">Daily spending</CardTitle>
        </CardHeader>
        <CardContent>
          <SpendingCalendar
            transactions={monthTransactions}
            currency={wallet.base_currency}
            year={now.getFullYear()}
            month={now.getMonth()}
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
            <InsightsList insights={insights} onDismiss={(id) => dismissInsight.mutate(id)} />
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
