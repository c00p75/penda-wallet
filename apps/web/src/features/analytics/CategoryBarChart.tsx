import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { formatMoney } from '@/lib/money'
import type { Transaction } from '@/features/transactions/types'

interface CategoryBarChartProps {
  transactions: Transaction[]
  currency: string
}

export function CategoryBarChart({ transactions, currency }: CategoryBarChartProps) {
  const totals = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    const name = tx.category?.name ?? 'Uncategorized'
    totals.set(name, (totals.get(name) ?? 0) + tx.amount_minor)
  }

  const data = Array.from(totals.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8)

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No spending yet this month.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={data.length * 36 + 16}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }} barCategoryGap={10}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'var(--viz-muted-ink)', fontSize: 12 }}
        />
        <Bar dataKey="amount" fill="var(--viz-seq-450)" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((entry) => (
            <Cell key={entry.name} />
          ))}
          <LabelList
            dataKey="amount"
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
