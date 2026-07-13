import { ArrowLeft, Bell, BellRing } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/store/authStore'
import { useDefaultWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { usePushSubscriptionStatus, useSubscribeToPush } from '@/features/notifications/hooks'
import { useDismissInsight, useInsights } from './hooks'
import { CategoryBarChart } from './CategoryBarChart'
import { SpendingCalendar } from './SpendingCalendar'
import { InsightsList } from './InsightsList'

export function AnalyticsPage() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useDefaultWallet()
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: insights = [] } = useInsights(wallet?.id)
  const dismissInsight = useDismissInsight(wallet?.id)
  const { data: isSubscribed } = usePushSubscriptionStatus()
  const subscribeToPush = useSubscribeToPush()

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

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4 pb-12">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/" aria-label="Back">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Analytics</h1>
      </header>

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
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnableNotifications}
            disabled={isSubscribed || subscribeToPush.isPending}
          >
            {isSubscribed ? <BellRing className="size-4" /> : <Bell className="size-4" />}
            {isSubscribed ? 'Enabled' : 'Enable alerts'}
          </Button>
        </CardHeader>
        <CardContent>
          <InsightsList insights={insights} onDismiss={(id) => dismissInsight.mutate(id)} />
        </CardContent>
      </Card>
    </div>
  )
}
