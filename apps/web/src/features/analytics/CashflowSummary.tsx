import type { ReactNode } from 'react'
import { TrendDown, TrendUp } from '@/components/icons/product'
import { Card, CardContent } from '@/components/ui/card'
import { formatMoneyParts } from '@/lib/money'
import { cn } from '@/lib/utils'

interface CashflowSummaryProps {
  currency: string
  incomeMinor: number
  expenseMinor: number
  previousIncomeMinor: number
  previousExpenseMinor: number
}

function Delta({ current, previous, goodIsUp }: { current: number; previous: number; goodIsUp: boolean }) {
  if (previous <= 0) return <p className="mt-1 text-xs text-muted-foreground">No prior data</p>

  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return <p className="mt-1 text-xs text-muted-foreground">Flat vs prior period</p>

  const up = pct > 0
  const good = up === goodIsUp
  const Icon = up ? TrendUp : TrendDown
  return (
    <p
      className={cn(
        'mt-1 flex items-start gap-1 text-xs font-medium',
        good ? 'text-[var(--viz-income)]' : 'text-[var(--viz-expense)]',
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" weight="bold" />
      <span className="break-words">{Math.abs(pct)}% vs prior period</span>
    </p>
  )
}

function Tile({
  label,
  currency,
  amountMinor,
  color,
  children,
}: {
  label: string
  currency: string
  amountMinor: number
  color?: string
  children: ReactNode
}) {
  const { code, amount } = formatMoneyParts(amountMinor, currency)
  return (
    <div className="flex min-w-0 flex-col p-3">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-[11px] font-medium leading-none" style={color ? { color } : undefined}>
        {code}
      </p>
      <p
        className="mt-0.5 break-words text-sm font-semibold leading-snug tabular-nums sm:text-base"
        style={color ? { color } : undefined}
      >
        {amount}
      </p>
      {children}
    </div>
  )
}

/** KPI row: income, expenses, and net for the selected analytics period. */
export function CashflowSummary({
  currency,
  incomeMinor,
  expenseMinor,
  previousIncomeMinor,
  previousExpenseMinor,
}: CashflowSummaryProps) {
  const netMinor = incomeMinor - expenseMinor
  const previousNetMinor = previousIncomeMinor - previousExpenseMinor

  return (
    <Card>
      <CardContent className="grid grid-cols-3 divide-x divide-border/50 p-0">
        <Tile label="Income" currency={currency} amountMinor={incomeMinor} color="var(--viz-income)">
          <Delta current={incomeMinor} previous={previousIncomeMinor} goodIsUp />
        </Tile>
        <Tile label="Expenses" currency={currency} amountMinor={expenseMinor} color="var(--viz-expense)">
          <Delta current={expenseMinor} previous={previousExpenseMinor} goodIsUp={false} />
        </Tile>
        <Tile label="Net" currency={currency} amountMinor={netMinor}>
          <Delta current={netMinor} previous={previousNetMinor} goodIsUp />
        </Tile>
      </CardContent>
    </Card>
  )
}
