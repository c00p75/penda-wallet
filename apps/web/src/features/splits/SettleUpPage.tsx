import { Link, Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { SectionHeader } from '@/components/ui/section-header'
import { ActivityRow } from '@/components/ui/activity-row'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet, useWalletMembers } from '@/features/wallets/hooks'
import { netBalances, openPairDebts } from './balances'
import { useMarkSharesSettled, useRecordSettlement, useWalletSplits } from './hooks'

export function SettleUpPage() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()
  const { data: members = [] } = useWalletMembers(wallet?.id)
  const { data: splits = [], isLoading } = useWalletSplits(wallet?.id)
  const markSettled = useMarkSharesSettled(wallet?.id)
  const recordPayment = useRecordSettlement(wallet?.id)

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const labelFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.display_name?.trim() ||
    members.find((m) => m.user_id === userId)?.email ||
    'Member'

  const nets = netBalances(splits)
  const pairs = openPairDebts(splits)
  const currency = wallet.base_currency

  async function handleMarkSettled(shareIds: string[]) {
    try {
      await markSettled.mutateAsync(shareIds)
      toast('Marked settled.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update.')
    }
  }

  async function handleRecordPayment(pair: {
    fromUserId: string
    toUserId: string
    amountMinor: number
    shareIds: string[]
  }) {
    try {
      await recordPayment.mutateAsync({
        walletId: wallet!.id,
        userId: session!.user.id,
        currency,
        amountMinor: pair.amountMinor,
        fromUserId: pair.fromUserId,
        toLabel: labelFor(pair.toUserId),
        shareIds: pair.shareIds,
      })
      toast('Settlement recorded.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not record payment.')
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader title="Settle up" subtitle="Balances from shared expenses" />

      {members.length < 2 ? (
        <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Invite someone to this wallet to split and settle expenses.{' '}
          <Link to="/profile" className="underline">
            Open wallet settings
          </Link>
        </p>
      ) : isLoading ? null : pairs.length === 0 ? (
        <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Everyone is settled. Split an expense from the ledger to track who owes whom.
        </p>
      ) : (
        <>
          <section>
            <SectionHeader title="Net positions" />
            <div className="flex flex-col gap-2.5">
              {nets.map((n) => (
                <ActivityRow
                  key={n.userId}
                  title={labelFor(n.userId)}
                  subtitle={n.netMinor > 0 ? 'Is owed overall' : 'Owes overall'}
                  trailing={
                    <span
                      className={
                        n.netMinor > 0
                          ? 'font-semibold tabular-nums text-[var(--status-good)]'
                          : 'font-semibold tabular-nums text-destructive'
                      }
                    >
                      <HiddenAmount>
                        {n.netMinor > 0 ? '+' : ''}
                        {formatMoney(n.netMinor, currency)}
                      </HiddenAmount>
                    </span>
                  }
                />
              ))}
            </div>
          </section>

          <section>
            <SectionHeader title="Open balances" />
            <div className="flex flex-col gap-2.5">
              {pairs.map((pair) => (
                <div
                  key={`${pair.fromUserId}-${pair.toUserId}`}
                  className="flex flex-col gap-2 rounded-[1.25rem] bg-secondary/30 px-3.5 py-3 ring-1 ring-border/50"
                >
                  <p className="text-sm">
                    <span className="font-medium">{labelFor(pair.fromUserId)}</span>
                    {' owes '}
                    <span className="font-medium">{labelFor(pair.toUserId)}</span>
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    <HiddenAmount>{formatMoney(pair.amountMinor, currency)}</HiddenAmount>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={markSettled.isPending}
                      onClick={() => handleMarkSettled(pair.shareIds)}
                    >
                      Mark settled
                    </Button>
                    {session.user.id === pair.fromUserId || session.user.id === pair.toUserId ? (
                      <Button
                        size="sm"
                        className="rounded-full"
                        disabled={recordPayment.isPending}
                        onClick={() => handleRecordPayment(pair)}
                      >
                        Record payment
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      <BottomNav />
    </main>
  )
}
