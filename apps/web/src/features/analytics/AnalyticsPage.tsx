import { Bell, BellRing, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BottomNav } from '@/components/BottomNav'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { usePushSubscriptionStatus, useSubscribeToPush } from '@/features/notifications/hooks'
import { useEntitlement } from '@/features/entitlements/hooks'
import { FEATURE_COPY } from '@/features/entitlements/types'
import { formatMoney } from '@/lib/money'
import { AiInsight } from '@/components/AiInsight'
import { useDismissInsight, useInsights } from './hooks'
import { CategoryBarChart } from './CategoryBarChart'
import { SpendingCalendar } from './SpendingCalendar'
import { InsightsList } from './InsightsList'

export function AnalyticsPage() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()
  const { data: transactions = [] } = useTransactions(wallet?.id)
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
  const monthSpentMinor = monthTransactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount_minor, 0)

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4 pb-24">
      <header>
        <h1 className="text-xl font-semibold">What happened?</h1>
      </header>

      <AiInsight tone={latestInsight?.type === 'anomaly' ? 'attention' : 'default'}>
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
          <CardTitle className="text-base">This month by category</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryBarChart transactions={monthTransactions} currency={wallet.base_currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily spending</CardTitle>
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
          <CardTitle className="text-base">Insights</CardTitle>
          {isPremium && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnableNotifications}
              disabled={isSubscribed || subscribeToPush.isPending}
            >
              {isSubscribed ? <BellRing className="size-4" /> : <Bell className="size-4" />}
              {isSubscribed ? 'Enabled' : 'Enable alerts'}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isPremium ? (
            <InsightsList insights={insights} onDismiss={(id) => dismissInsight.mutate(id)} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Sparkles className="size-6 text-primary" />
              <p className="text-sm font-medium">{FEATURE_COPY.insights.title}</p>
              <p className="text-sm text-muted-foreground">{FEATURE_COPY.insights.description}</p>
              <p className="text-xs text-muted-foreground">Premium isn't available to purchase yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <BottomNav />
    </main>
  )
}
