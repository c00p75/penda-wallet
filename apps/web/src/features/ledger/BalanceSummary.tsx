import { formatMoney } from '@/lib/money'
import type { Transaction } from '@/features/transactions/types'
import { termFor, type ProfileMode } from '@/features/profile/modes'

interface BalanceSummaryProps {
  transactions: Transaction[]
  currency: string
  mode?: ProfileMode
}

export function BalanceSummary({ transactions, currency, mode = 'individual' }: BalanceSummaryProps) {
  const now = new Date()
  const thisMonth = transactions.filter((tx) => {
    const d = new Date(`${tx.transaction_date}T00:00:00`)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })

  const income = thisMonth
    .filter((tx) => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount_minor, 0)
  const expenses = thisMonth
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount_minor, 0)

  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl bg-background/70 p-4 shadow-xs backdrop-blur">
      <div>
        <p className="text-xs text-muted-foreground">{termFor(mode, 'income')} this month</p>
        <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
          {formatMoney(income, currency)}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{termFor(mode, 'expense')} this month</p>
        <p className="text-lg font-semibold">{formatMoney(expenses, currency)}</p>
      </div>
    </div>
  )
}
