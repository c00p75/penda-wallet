import { formatMoney } from '@/lib/money'
import type { Transaction } from '@/features/transactions/types'

interface SpendingCalendarProps {
  transactions: Transaction[]
  currency: string
  year: number
  month: number // 0-indexed, matches Date#getMonth()
}

const RAMP_STEPS = ['var(--viz-seq-150)', 'var(--viz-seq-300)', 'var(--viz-seq-450)', 'var(--viz-seq-550)', 'var(--viz-seq-650)']
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function bucketFor(amount: number, max: number): string | null {
  if (amount <= 0 || max <= 0) return null
  const ratio = amount / max
  const index = Math.min(RAMP_STEPS.length - 1, Math.floor(ratio * RAMP_STEPS.length))
  return RAMP_STEPS[index]
}

export function SpendingCalendar({ transactions, currency, year, month }: SpendingCalendarProps) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()

  const dailyTotals = new Array(daysInMonth + 1).fill(0) as number[]
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue
    const txDate = new Date(`${tx.transaction_date}T00:00:00`)
    if (txDate.getFullYear() !== year || txDate.getMonth() !== month) continue
    dailyTotals[txDate.getDate()] += tx.amount_minor
  }

  const maxDay = Math.max(...dailyTotals)
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i}>{label}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const amount = dailyTotals[day]
          const background = bucketFor(amount, maxDay)
          const isToday = isCurrentMonth && today.getDate() === day
          return (
            <div
              key={day}
              title={amount > 0 ? `${monthDayLabel(year, month, day)}: ${formatMoney(amount, currency)}` : monthDayLabel(year, month, day)}
              className={`flex aspect-square items-center justify-center rounded-md text-[11px] ${isToday ? 'ring-2 ring-primary' : ''}`}
              style={{ backgroundColor: background ?? 'var(--muted)', color: background ? 'white' : 'var(--viz-muted-ink)' }}
            >
              {day}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <span>Less</span>
        {RAMP_STEPS.map((step) => (
          <span key={step} className="size-3 rounded-sm" style={{ backgroundColor: step }} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

function monthDayLabel(year: number, month: number, day: number): string {
  return new Date(year, month, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
