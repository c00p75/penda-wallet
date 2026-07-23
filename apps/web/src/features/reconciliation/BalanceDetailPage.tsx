import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { BalanceVisibilityToggle } from '@/components/BalanceVisibilityToggle'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { useReconciliations } from './hooks'
import { useSetBalance } from './useSetBalance'
import { EditBalanceSheet } from './EditBalanceSheet'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function BalanceDetailPage() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: reconciliations = [] } = useReconciliations(wallet?.id, session?.user.id)
  const setBalance = useSetBalance(wallet?.id, session?.user.id)

  const [editOpen, setEditOpen] = useState(false)

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const currency = wallet.base_currency

  const balanceMinor = transactions.reduce((sum, tx) => {
    const amt = tx.converted_amount_minor ?? tx.amount_minor
    return sum + (tx.type === 'income' ? amt : tx.type === 'expense' ? -amt : 0)
  }, 0)
  const isNegative = balanceMinor < 0

  async function handleEditBalance(actualBalanceMinor: number) {
    try {
      await setBalance.mutateAsync({ computedBalanceMinor: balanceMinor, actualBalanceMinor, currency })
      toast('Balance updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader size="compact" title="Balance" />

      <div className="relative flex flex-col items-center gap-1 rounded-[1.75rem] bg-card p-6 shadow-[var(--shadow-card)] ring-1 ring-border/50">
        <BalanceVisibilityToggle id="balance" className="absolute right-4 top-4 size-8 text-muted-foreground hover:bg-muted hover:text-foreground" />
        <p className="text-xs font-medium tracking-wide text-muted-foreground">This wallet</p>
        <p className="text-4xl font-bold tabular-nums">
          <HiddenAmount id="balance">
            {isNegative ? '−' : ''}
            {formatMoney(Math.abs(balanceMinor), currency)}
          </HiddenAmount>
        </p>
        <p className="text-sm text-muted-foreground">Cash in this wallet after income and spending so far.</p>
      </div>

      <Button size="lg" className="w-full" onClick={() => setEditOpen(true)}>
        Edit balance
      </Button>

      {reconciliations.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Balance history</h2>
          <ul className="flex flex-col gap-1">
            {reconciliations.map((r) => {
              const delta = r.actual_balance_minor - r.computed_balance_minor
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm tabular-nums"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.status === 'adjusted' ? 'Adjusted' : 'Confirmed'}
                    </span>
                  </div>
                  <span className={cn('font-medium', delta > 0 && 'text-emerald-600 dark:text-emerald-400')}>
                    {delta === 0 ? formatMoney(r.actual_balance_minor, currency) : null}
                    {delta > 0 && `+${formatMoney(delta, currency)}`}
                    {delta < 0 && `−${formatMoney(Math.abs(delta), currency)}`}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <EditBalanceSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        computedBalanceMinor={balanceMinor}
        onSubmit={handleEditBalance}
        isSubmitting={setBalance.isPending}
      />

      <BottomNav />
    </main>
  )
}
