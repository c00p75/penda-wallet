import { Navigate } from 'react-router-dom'
import {
  Camera,
  ChatCircle,
  DeviceMobile,
  Microphone,
  Robot,
  type Icon,
} from '@/components/icons/product'
import { ActivityRow } from '@/components/ui/activity-row'
import { SectionHeader } from '@/components/ui/section-header'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { formatMoney } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import type { TransactionSource } from '@/features/transactions/types'

const AUTO_SOURCES: TransactionSource[] = ['sms', 'chat', 'voice', 'receipt']

const PROVENANCE: Record<string, { label: string; detail: string; icon: Icon }> = {
  sms: { label: 'SMS', detail: 'Auto-added from MoMo/bank text', icon: DeviceMobile },
  chat: { label: 'Chat', detail: 'Logged via Ask Penda', icon: ChatCircle },
  voice: { label: 'Voice', detail: 'Captured from voice', icon: Microphone },
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
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader title="Activity log" subtitle="What Penda added for you" />

      {autoLogged.length === 0 ? (
        <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing auto-logged yet. Scan a receipt or tell Penda about a purchase.
        </p>
      ) : (
        <section>
          <SectionHeader title={`${autoLogged.length} auto-logged`} />
          <div className="flex flex-col gap-2.5">
            {autoLogged.map((tx) => {
              const meta = PROVENANCE[tx.source] ?? {
                label: tx.source,
                detail: 'Added by Penda',
                icon: Robot,
              }
              const SourceIcon = meta.icon
              const sign = tx.type === 'expense' ? '−' : '+'
              return (
                <ActivityRow
                  key={tx.id}
                  avatar={
                    <span className="grid size-full place-items-center bg-[var(--iris-soft)] text-[var(--iris)]">
                      <SourceIcon className="size-4" weight="duotone" />
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
