import { Mic, MessageCircle, Camera, RefreshCw, Smartphone } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
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

const SOURCE_LABEL: Record<Exclude<Transaction['source'], 'manual'>, string> = {
  voice: 'Added by voice',
  chat: 'Added by Penda',
  receipt: 'From receipt scan',
  recurring: 'Recurring',
  sms: 'From MoMo SMS',
}

/** Small colored source indicator: voice = mic, chat = message, receipt = camera, sms = smartphone */
function SourceDot({ source }: { source: Transaction['source'] }) {
  if (source === 'manual') return null
  const map: Record<string, { icon: React.ElementType; color: string }> = {
    voice: { icon: Mic, color: 'var(--iris)' },
    chat: { icon: MessageCircle, color: 'var(--mint)' },
    receipt: { icon: Camera, color: 'var(--apricot)' },
    recurring: { icon: RefreshCw, color: 'var(--muted-foreground)' },
    sms: { icon: Smartphone, color: 'var(--iris)' },
  }
  const entry = map[source]
  if (!entry) return null
  const Icon = entry.icon
  return (
    <span
      className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-background"
      title={SOURCE_LABEL[source]}
      aria-label={SOURCE_LABEL[source]}
    >
      <Icon className="size-2.5" style={{ color: entry.color }} strokeWidth={2.5} />
    </span>
  )
}

// Icon avatar tint by transaction type
function chipStyle(type: Transaction['type']) {
  if (type === 'income') return { background: 'var(--mint-soft)', color: 'var(--mint)' }
  if (type === 'transfer') return { background: 'var(--accent)', color: 'var(--accent-foreground)' }
  return { background: 'var(--iris-soft)', color: 'var(--iris)' }
}

export function TransactionList({ transactions, onSelect }: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div
          className="flex size-14 items-center justify-center rounded-full text-2xl"
          style={{ background: 'var(--iris-soft)' }}
        >
          💸
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-medium">No transactions yet</p>
          <p className="text-sm text-muted-foreground">
            Log one below or tell Penda about a recent purchase
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {groupByDate(transactions).map(([date, txs]) => (
        <div key={date} className="flex flex-col gap-0.5">
          <h3 className="mb-2 px-1 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {formatDateHeading(date)}
          </h3>
          {txs.map((tx) => {
            const label = tx.merchant || tx.category?.name || 'Uncategorized'
            const isIncome = tx.type === 'income'
            return (
              <button
                key={tx.id}
                type="button"
                onClick={() => onSelect(tx)}
                className="group flex items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-accent/60 active:bg-accent"
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <span
                    className="flex size-11 items-center justify-center rounded-full text-base font-semibold uppercase"
                    style={tx.category?.icon ? { background: 'var(--accent)' } : chipStyle(tx.type)}
                  >
                    {tx.category?.icon ?? label.slice(0, 1)}
                  </span>
                  <SourceDot source={tx.source} />
                </div>

                {/* Label + category */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tx.category?.name ?? 'Uncategorized'}
                    {tx.source !== 'manual' ? ` · ${SOURCE_LABEL[tx.source]}` : ''}
                  </p>
                </div>

                {/* Amount */}
                <span
                  className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums',
                    isIncome ? 'text-emerald-600 dark:text-emerald-400' : '',
                  )}
                >
                  {isIncome ? '+' : '−'}
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
