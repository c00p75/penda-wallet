import { accountBalanceMinor } from '@penda/money-core'
import { ArrowLeftRight, Pencil, Scale } from 'lucide-react'
import { ActivityRow } from '@/components/ui/activity-row'
import { Button } from '@/components/ui/button'
import { BottomSheetHandle, useBottomSheetDrag } from '@/components/ui/bottomSheetDrag'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { formatMoney } from '@/lib/money'
import { useCloseOnBack } from '@/lib/useCloseOnBack'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/features/transactions/types'
import type { Account } from './types'

interface PocketDetailSheetProps {
  account: Account | null
  accounts: Account[]
  transactions: Transaction[]
  currency: string
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onTransfer: () => void
  onSetBalance: () => void
  onOpenTransaction: (tx: Transaction) => void
}

export function PocketDetailSheet({
  account,
  accounts,
  transactions,
  currency,
  onOpenChange,
  onEdit,
  onTransfer,
  onSetBalance,
  onOpenTransaction,
}: PocketDetailSheetProps) {
  const open = !!account
  useCloseOnBack(open, () => onOpenChange(false))
  const drag = useBottomSheetDrag(() => onOpenChange(false))

  if (!account) return null

  const balance = accountBalanceMinor(transactions, account.id)
  const negative = balance < 0
  const recent = transactions
    .filter((tx) => tx.account_id === account.id)
    .slice(0, 8)
  const canTransfer = accounts.length >= 2

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        size="half"
        showCloseButton={false}
        className={cn(
          'gap-0 p-0',
          'h-auto max-h-[min(92svh,calc(100%-1.25rem))] overflow-y-auto',
        )}
        style={drag.sheetStyle}
      >
        <BottomSheetHandle {...drag.handleProps} />

        <SheetHeader className="px-5 pt-2 pb-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">Wallet</p>
          <SheetTitle className="flex items-center gap-2 text-lg">
            <span aria-hidden>{account.icon ?? '💳'}</span>
            {account.name}
          </SheetTitle>
          <SheetDescription className="text-[0.9rem] leading-snug">
            {account.is_default
              ? 'Default for new transactions in this money account.'
              : 'Balance and recent activity for this wallet.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="rounded-[1.5rem] bg-card px-5 py-5 shadow-[var(--shadow-soft)] ring-1 ring-border/50">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">Balance</p>
            <p
              className={cn(
                'mt-1 text-3xl font-bold tracking-tight tabular-nums',
                negative && 'text-[var(--rose)]',
              )}
            >
              <HiddenAmount>
                {negative ? '−' : ''}
                {formatMoney(Math.abs(balance), currency)}
              </HiddenAmount>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto flex-col gap-1 rounded-2xl py-3"
              onClick={onSetBalance}
            >
              <Scale className="size-4" />
              <span className="text-[0.7rem] font-medium">Set balance</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto flex-col gap-1 rounded-2xl py-3"
              disabled={!canTransfer}
              onClick={onTransfer}
            >
              <ArrowLeftRight className="size-4" />
              <span className="text-[0.7rem] font-medium">Transfer</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto flex-col gap-1 rounded-2xl py-3"
              onClick={onEdit}
            >
              <Pencil className="size-4" />
              <span className="text-[0.7rem] font-medium">Edit</span>
            </Button>
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Recent in this wallet</h3>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing logged here yet. New transactions can use this wallet from the form.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {recent.map((tx) => {
                  const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''
                  return (
                    <ActivityRow
                      key={tx.id}
                      onClick={() => onOpenTransaction(tx)}
                      avatar={
                        <span>{tx.category?.icon ?? (tx.type === 'income' ? '💰' : '💳')}</span>
                      }
                      title={tx.merchant || tx.description || tx.category?.name || 'Transaction'}
                      subtitle={
                        <>
                          {tx.category?.name ?? (tx.type === 'transfer' ? 'Transfer' : 'Uncategorized')}
                          <span className="mx-1">·</span>
                          {new Date(tx.transaction_date + 'T12:00:00').toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </>
                      }
                      trailing={
                        <span
                          style={{
                            color: tx.type === 'income' ? 'var(--mint)' : 'var(--foreground)',
                          }}
                        >
                          <HiddenAmount>
                            {sign}
                            {formatMoney(tx.amount_minor, tx.currency || currency)}
                          </HiddenAmount>
                        </span>
                      }
                      showChevron
                    />
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
