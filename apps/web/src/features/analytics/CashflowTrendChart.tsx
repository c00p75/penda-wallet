import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { formatMoney } from '@/lib/money'
import type { CashflowBucket } from './aggregate'

interface CashflowTrendChartProps {
  buckets: CashflowBucket[]
  currency: string
}

function TrendTooltip({
  active,
  payload,
  label,
  currency,
}: TooltipContentProps & { currency: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border/70 bg-popover px-3 py-2 text-xs shadow-[var(--shadow-card)]">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} className="mt-1 flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-3 font-medium tabular-nums text-foreground">
            {formatMoney(Number(entry.value ?? 0), currency)}
          </span>
        </p>
      ))}
    </div>
  )
}

/** Income vs. expenses over the selected analytics period, bucketed by day/week/month. */
export function CashflowTrendChart({ buckets, currency }: CashflowTrendChartProps) {
  const hasData = buckets.some((b) => b.incomeMinor > 0 || b.expenseMinor > 0)

  if (!hasData) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No income or expenses in this period yet.</p>
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={2} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--viz-gridline)" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--viz-muted-ink)', fontSize: 11 }}
          />
          <YAxis hide />
          <Tooltip
            content={(props: TooltipContentProps) => (
              <TrendTooltip {...props} currency={currency} />
            )}
            cursor={{ fill: 'var(--muted)' }}
          />
          <Bar dataKey="incomeMinor" name="Income" fill="var(--viz-income)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar dataKey="expenseMinor" name="Expenses" fill="var(--viz-expense)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center justify-end gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: 'var(--viz-income)' }} />
          Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: 'var(--viz-expense)' }} />
          Expenses
        </span>
      </div>
    </div>
  )
}
