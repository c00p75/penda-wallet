import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Bot, Camera, MessageCircle, Mic, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActivityRow } from '@/components/ui/activity-row'
import { SectionHeader } from '@/components/ui/section-header'
import { BottomNav } from '@/components/BottomNav'
import { formatMoney } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
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
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24">
      <header className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 rounded-2xl bg-card shadow-[var(--shadow-soft)] ring-1 ring-border/50"
          asChild
        >
          <Link to="/settings" aria-label="Back to settings">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-[2rem] font-bold tracking-tight leading-tight">Activity log</h1>
          <p className="text-sm text-muted-foreground">What Penda added for you</p>
        </div>
      </header>

      {autoLogged.length === 0 ? (
        <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing auto-logged yet. Paste a MoMo SMS, scan a receipt, or tell Penda about a purchase.
        </p>
      ) : (
        <section>
          <SectionHeader title={`${autoLogged.length} auto-logged`} />
          <div className="flex flex-col gap-2.5">
            {autoLogged.map((tx) => {
              const meta = PROVENANCE[tx.source] ?? {
                label: tx.source,
                detail: 'Added by Penda',
                icon: Bot,
              }
              const Icon = meta.icon
              const sign = tx.type === 'expense' ? '−' : '+'
              return (
                <ActivityRow
                  key={tx.id}
                  avatar={
                    <span className="grid size-full place-items-center bg-[var(--iris-soft)] text-[var(--iris)]">
                      <Icon className="size-4" />
                    </span>
                  }
                  title={tx.merchant || tx.description || 'Transaction'}
                  subtitle={
                    <>
                      <span className="font-medium text-foreground/80">{meta.label}</span>
                      {' · '}
                      {meta.detail}
                      {' · '}
                      {tx.transaction_date}
                    </>
                  }
                  trailing={
                    <span style={{ color: tx.type === 'income' ? 'var(--mint)' : undefined }}>
                      <HiddenAmount>
                        {sign}
                        {formatMoney(tx.amount_minor, tx.currency)}
                      </HiddenAmount>
                    </span>
                  }
                />
              )
            })}
          </div>
        </section>
      )}

      <BottomNav />
    </main>
  )
}
