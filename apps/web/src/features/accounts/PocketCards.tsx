import { accountBalanceMinor } from '@penda/money-core'
import { Plus, ArrowLeftRight } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { cn } from '@/lib/utils'
import type { Account } from './types'
import type { Transaction } from '@/features/transactions/types'

interface PocketCardsProps {
  accounts: Account[]
  transactions: Transaction[]
  currency: string
  onAdd: () => void
  onSelect: (account: Account) => void
  onTransfer: () => void
}

export function PocketCards({
  accounts,
  transactions,
  currency,
  onAdd,
  onSelect,
  onTransfer,
}: PocketCardsProps) {
  if (accounts.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Your wallets</h2>
          <button
            type="button"
            onClick={onAdd}
            className="text-xs font-medium text-primary"
          >
            Add wallet
          </button>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-[1.35rem] border border-dashed border-border/70 bg-card px-4 py-6 text-center text-sm text-muted-foreground shadow-[var(--shadow-soft)]"
        >
          Add Cash, Airtel Money, MTN, or a bank wallet
        </button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Your wallets</h2>
        <div className="flex items-center gap-3">
          {accounts.length >= 2 && (
            <button
              type="button"
              onClick={onTransfer}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftRight className="size-3.5" />
              Transfer
            </button>
          )}
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            <Plus className="size-3.5" />
            Add
          </button>
        </div>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {accounts.map((account) => {
          const balance = accountBalanceMinor(transactions, account.id)
          const negative = balance < 0
          return (
            <button
              key={account.id}
              type="button"
              onClick={() => onSelect(account)}
              className={cn(
                'flex w-[9.5rem] shrink-0 flex-col gap-2 rounded-[1.35rem] bg-card p-3.5 text-left shadow-[var(--shadow-soft)] ring-1 ring-border/50 transition-transform active:scale-[0.98]',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-2xl bg-secondary text-lg">
                  {account.icon ?? '💳'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">{account.name}</p>
                  {account.is_default && (
                    <p className="text-[10px] font-medium text-muted-foreground">Default</p>
                  )}
                </div>
              </div>
              <p
                className={cn(
                  'text-base font-bold tabular-nums tracking-tight',
                  negative && 'text-[var(--rose)]',
                )}
              >
                <HiddenAmount>{formatMoney(balance, currency)}</HiddenAmount>
              </p>
            </button>
          )
        })}
      </div>
    </section>
  )
}
