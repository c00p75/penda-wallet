import { Card, CardContent } from '@/components/ui/card'
import { formatMoney } from '@/lib/money'
import type { Transaction } from '@/features/transactions/types'

interface BalanceSummaryProps {
  transactions: Transaction[]
  currency: string
}

export function BalanceSummary({ transactions, currency }: BalanceSummaryProps) {
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
    <Card>
      <CardContent className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Income this month</p>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {formatMoney(income, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Spent this month</p>
          <p className="text-lg font-semibold">{formatMoney(expenses, currency)}</p>
        </div>
      </CardContent>
    </Card>
  )
}
