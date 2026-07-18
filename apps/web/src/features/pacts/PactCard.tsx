import { Ban, Check, X } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import type { Category } from '@/features/categories/types'
import type { Transaction } from '@/features/transactions/types'
import type { CommitmentPact } from './types'
import { computePactStatus } from './pactStatus'

interface PactCardProps {
  pact: CommitmentPact
  transactions: Transaction[]
  category: Category | null
  currency: string
  onDelete: () => void
}

const STATUS_STYLE = {
  active: { icon: Ban, color: 'var(--iris)', label: (days: number) => `${days} day${days === 1 ? '' : 's'} left` },
  kept: { icon: Check, color: 'var(--mint)', label: () => 'Kept' },
  broken: { icon: X, color: 'var(--rose)', label: () => 'Broken' },
} as const

export function PactCard({ pact, transactions, category, currency, onDelete }: PactCardProps) {
  const result = computePactStatus(pact, transactions, new Date())
  const style = STATUS_STYLE[result.status]
  const Icon = style.icon

  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${style.color} 16%, transparent)` }}
      >
        <Icon className="size-5" style={{ color: style.color }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{pact.description}</p>
        <p className="text-xs text-muted-foreground">
          No {category?.name ?? 'spending'} · {style.label(result.daysLeft)}
          {result.status === 'broken' && result.breakingTransaction && (
            <>, {formatMoney(result.breakingTransaction.amount_minor, currency)} on {result.breakingTransaction.transaction_date}</>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        aria-label="Remove pact"
      >
        Remove
      </button>
    </div>
  )
}
