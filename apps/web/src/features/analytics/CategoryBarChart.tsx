import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { formatMoney } from '@/lib/money'
import type { Transaction } from '@/features/transactions/types'
import { categoryTotals } from './aggregate'

interface CategoryBarChartProps {
  transactions: Transaction[]
  currency: string
  /** Which side of the ledger to break down. */
  type: 'expense' | 'income'
  /** Bar fill — pass `--viz-expense`/`--viz-income` so this chart matches the rest of the page. */
  color: string
}

function CategoryTooltip({
  active,
  payload,
  currency,
}: TooltipContentProps & { currency: string }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  return (
    <div className="rounded-lg border border-border/70 bg-popover px-3 py-2 text-xs shadow-[var(--shadow-card)]">
      <p className="font-medium text-foreground">{String(entry.payload?.category ?? '')}</p>
      <p className="mt-0.5 font-medium tabular-nums text-foreground">
        {formatMoney(Number(entry.value ?? 0), currency)}
      </p>
    </div>
  )
}

export function CategoryBarChart({ transactions, currency, type, color }: CategoryBarChartProps) {
  const data = categoryTotals(transactions, type)

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No {type === 'expense' ? 'spending' : 'income'} in this period yet.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={data.length * 36 + 16}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }} barCategoryGap={10}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="category"
          width={110}
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'var(--viz-muted-ink)', fontSize: 12 }}
        />
        <Tooltip
          content={(props: TooltipContentProps) => (
            <CategoryTooltip {...props} currency={currency} />
          )}
          cursor={{ fill: 'var(--muted)' }}
        />
        <Bar dataKey="amount_minor" fill={color} radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((entry) => (
            <Cell key={entry.category} />
          ))}
          <LabelList
            dataKey="amount_minor"
            position="right"
            formatter={(value) => formatMoney(Number(value), currency)}
            fill="var(--viz-muted-ink)"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
