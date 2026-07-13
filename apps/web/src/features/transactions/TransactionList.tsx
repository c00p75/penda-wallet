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
    <div className="flex flex-col gap-4">
      {groupByDate(transactions).map(([date, txs]) => (
        <div key={date}>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            {formatDateHeading(date)}
          </h3>
          <div className="flex flex-col overflow-hidden rounded-lg border">
            {txs.map((tx) => (
              <button
                key={tx.id}
                type="button"
                onClick={() => onSelect(tx)}
                className="flex items-center justify-between gap-3 border-b p-3 text-left last:border-b-0 hover:bg-accent"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {tx.merchant || tx.category?.name || 'Uncategorized'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tx.category?.name ?? 'Uncategorized'}
                  </p>
                </div>
                <span
                  className={
                    tx.type === 'income'
                      ? 'shrink-0 font-medium text-emerald-600 dark:text-emerald-400'
                      : 'shrink-0 font-medium'
                  }
                >
                  {tx.type === 'income' ? '+' : '-'}
                  {formatMoney(tx.amount_minor, tx.currency)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
