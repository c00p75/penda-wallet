import { Repeat } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import type { Transaction } from './types'

interface TransactionListProps {
  transactions: Transaction[]
  onSelect: (transaction: Transaction) => void
}

function groupByDate(transactions: Transaction[]) {
  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const existing = groups.get(tx.transaction_date)
    if (existing) {
      existing.push(tx)
    } else {
      groups.set(tx.transaction_date, [tx])
    }
  }
  return Array.from(groups.entries())
}

function formatDateHeading(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// Icon chip tint by transaction type — income reads mint, spend reads iris.
function chipStyle(type: Transaction['type']) {
  if (type === 'income') return { background: 'var(--mint-soft)', color: 'var(--mint)' }
  if (type === 'transfer') return { background: 'var(--accent)', color: 'var(--accent-foreground)' }
  return { background: 'var(--iris-soft)', color: 'var(--iris)' }
}

export function TransactionList({ transactions, onSelect }: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-16 text-center text-muted-foreground">
        <p className="font-medium">No transactions yet</p>
        <p className="text-sm">Tap the + button to add your first one.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {groupByDate(transactions).map(([date, txs]) => (
        <div key={date} className="flex flex-col gap-1">
          <h3 className="mb-1 px-1 font-mono text-[0.68rem] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {formatDateHeading(date)}
          </h3>
          {txs.map((tx) => {
            const label = tx.merchant || tx.category?.name || 'Uncategorized'
            return (
              <button
                key={tx.id}
                type="button"
                onClick={() => onSelect(tx)}
                className="flex items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-accent"
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold uppercase"
                  style={tx.category?.icon ? undefined : chipStyle(tx.type)}
                >
                  {tx.category?.icon ?? label.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-medium">
                    {tx.source === 'recurring' && (
                      <Repeat className="size-3 shrink-0 text-muted-foreground" aria-label="Recurring" />
                    )}
                    <span className="truncate">{label}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{tx.category?.name ?? 'Uncategorized'}</p>
                </div>
                <span
                  className="shrink-0 font-medium tabular-nums"
                  style={tx.type === 'income' ? { color: 'var(--mint)' } : undefined}
                >
                  {tx.type === 'income' ? '+' : '−'}
                  {formatMoney(tx.amount_minor, tx.currency)}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
