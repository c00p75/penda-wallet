import { formatMoney } from '@/lib/money'
import type { Category } from '@/features/categories/types'
import type { BudgetProgress } from './types'

interface BudgetProgressCardProps {
  progress: BudgetProgress
  category: Category | null
  currency: string
  onSelect: () => void
}

// Coaching over shaming: over-budget goes warm rose with an offer to help,
// never an alarm-red failure state.
function statusColorFor(pct: number) {
  if (pct >= 1) return { bg: 'var(--rose-soft)', fg: 'var(--rose)' }
  if (pct >= 0.8) return { bg: 'var(--apricot-soft)', fg: 'var(--apricot)' }
  return { bg: 'var(--mint-soft)', fg: 'var(--mint)' }
}

// A category without a custom color still needs visual variety in the grid —
// pick one of the brand tints deterministically from its id so the same
// category always lands on the same color.
const FALLBACK_TINTS = [
  { bg: 'var(--iris-soft)', fg: 'var(--iris)' },
  { bg: 'var(--apricot-soft)', fg: 'var(--apricot)' },
  { bg: 'var(--mint-soft)', fg: 'var(--mint)' },
  { bg: 'var(--rose-soft)', fg: 'var(--rose)' },
]

function iconTintFor(category: Category | null) {
  if (category?.color) {
    return { bg: `color-mix(in srgb, ${category.color} 20%, transparent)`, fg: category.color }
  }
  const seed = category?.id ?? 'overall'
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return FALLBACK_TINTS[hash % FALLBACK_TINTS.length]
}

export function BudgetProgressCard({ progress, category, currency, onSelect }: BudgetProgressCardProps) {
  const cap = progress.effective_amount_minor
  const pct = cap > 0 ? progress.spent_minor / cap : 0
  const pctLabel = Math.round(pct * 100)
  const remaining = cap - progress.spent_minor
  const status = statusColorFor(pct)
  const iconTint = iconTintFor(category)
  const showEnvelopeRemaining = progress.rollover

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full text-lg"
          style={{ background: iconTint.bg, color: iconTint.fg }}
        >
          {category?.icon ?? '💰'}
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
          style={{ background: status.bg, color: status.fg }}
        >
          {pctLabel}% used
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate font-medium">{category?.name ?? 'Overall'}</p>
        {showEnvelopeRemaining ? (
          <>
            <p
              className="mt-1 text-lg font-bold tabular-nums"
              style={{ color: remaining >= 0 ? 'var(--mint)' : 'var(--rose)' }}
            >
              {formatMoney(Math.abs(remaining), currency)}
              <span className="ml-1 text-sm font-medium text-muted-foreground">
                {remaining >= 0 ? 'left' : 'over'}
              </span>
            </p>
            <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
              {formatMoney(progress.spent_minor, currency)} of {formatMoney(cap, currency)}
              {progress.carried_over_minor !== 0 && (
                <>
                  {' · '}
                  {progress.carried_over_minor > 0 ? '+' : ''}
                  {formatMoney(progress.carried_over_minor, currency)} rolled over
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="mt-0.5 truncate text-sm tabular-nums text-muted-foreground">
              {formatMoney(progress.spent_minor, currency)} of {formatMoney(cap, currency)}
            </p>
          </>
        )}
      </div>
    </button>
  )
}
