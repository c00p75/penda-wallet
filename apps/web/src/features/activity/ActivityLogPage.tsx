import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Bot, Camera, MessageCircle, Mic, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BottomNav } from '@/components/BottomNav'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import type { TransactionSource } from '@/features/transactions/types'

const AUTO_SOURCES: TransactionSource[] = ['sms', 'chat', 'voice', 'receipt']

const PROVENANCE: Record<
  string,
  { label: string; detail: string; icon: typeof Bot }
> = {
  sms: { label: 'SMS', detail: 'Auto-added from MoMo/bank text', icon: Smartphone },
  chat: { label: 'Chat', detail: 'Logged via Ask Penda', icon: MessageCircle },
  voice: { label: 'Voice', detail: 'Captured from voice', icon: Mic },
  receipt: { label: 'Receipt', detail: 'Scanned from a photo', icon: Camera },
}

export function ActivityLogPage() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()
  const { data: transactions = [] } = useTransactions(wallet?.id)

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const autoLogged = transactions
    .filter((tx) => AUTO_SOURCES.includes(tx.source))
    .slice()
    .sort((a, b) => {
      const byDate = b.transaction_date.localeCompare(a.transaction_date)
      if (byDate !== 0) return byDate
      return b.created_at.localeCompare(a.created_at)
    })

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 bg-background p-4 pb-24">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full" asChild>
          <Link to="/settings" aria-label="Back to settings">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Activity log</h1>
          <p className="text-sm text-muted-foreground">What Penda added for you</p>
        </div>
      </header>

      {autoLogged.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nothing auto-logged yet. Paste a MoMo SMS, scan a receipt, or tell Penda about a purchase.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {autoLogged.map((tx) => {
            const meta = PROVENANCE[tx.source] ?? {
              label: tx.source,
              detail: 'Added by Penda',
              icon: Bot,
            }
            const Icon = meta.icon
            return (
              <li key={tx.id} className="flex items-start gap-3 rounded-2xl border bg-card p-3">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-full"
                  style={{ background: 'var(--iris-soft)', color: 'var(--iris)' }}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium">{tx.merchant || tx.description || 'Transaction'}</p>
                    <span
                      className="shrink-0 text-sm font-semibold tabular-nums"
                      style={{ color: tx.type === 'income' ? 'var(--mint)' : undefined }}
                    >
                      {tx.type === 'expense' ? '−' : '+'}
                      {formatMoney(tx.amount_minor, tx.currency)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{meta.label}</span>
                    {' · '}
                    {meta.detail}
                  </p>
                  <p className="text-xs text-muted-foreground">{tx.transaction_date}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <BottomNav />
    </main>
  )
}
