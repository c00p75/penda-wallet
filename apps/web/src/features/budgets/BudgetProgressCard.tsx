import { formatMoney } from '@/lib/money'
import { cardAccentClass, type CardAccent } from '@/components/ui/cardAccent'
import { cn } from '@/lib/utils'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
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
function statusColorFor(pct: number): {
  bg: string
  fg: string
  accent: CardAccent
  label: string
} {
  if (pct >= 1) return { bg: 'var(--rose-soft)', fg: 'var(--rose)', accent: 'rose', label: 'Over' }
  if (pct >= 0.8) return { bg: 'var(--apricot-soft)', fg: 'var(--apricot)', accent: 'apricot', label: 'Warm' }
  return { bg: 'var(--mint-soft)', fg: 'var(--mint)', accent: 'mint', label: 'On track' }
}

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

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-3 rounded-[1.5rem] bg-card p-3.5 text-left shadow-[var(--shadow-soft)] transition-transform active:scale-[0.98]',
        cardAccentClass(status.accent),
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-2xl text-base"
          style={{ background: iconTint.bg, color: iconTint.fg }}
        >
          {category?.icon ?? '💰'}
        </span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: status.bg, color: status.fg }}
        >
          {status.label}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{category?.name ?? 'Overall'}</p>
        <p
          className="mt-1 text-lg font-bold leading-none tabular-nums tracking-tight"
          style={{ color: remaining >= 0 ? undefined : 'var(--rose)' }}
        >
          <HiddenAmount>{formatMoney(Math.abs(remaining), currency)}</HiddenAmount>
          <span className="ml-1 text-xs font-medium text-muted-foreground">
            {remaining >= 0 ? 'left' : 'over'}
          </span>
        </p>
        <p className="mt-1 truncate text-[11px] tabular-nums text-muted-foreground">
          <HiddenAmount>{formatMoney(progress.spent_minor, currency)}</HiddenAmount>
          {' of '}
          <HiddenAmount>{formatMoney(cap, currency)}</HiddenAmount>
          {progress.rollover && progress.carried_over_minor !== 0 && (
            <>
              {' · '}
              {progress.carried_over_minor > 0 ? '+' : ''}
              <HiddenAmount>{formatMoney(progress.carried_over_minor, currency)}</HiddenAmount>
              {' rolled'}
            </>
          )}
        </p>
      </div>

      <div className="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${Math.max(0, Math.min(100, pctLabel))}%`,
            background: status.fg,
          }}
        />
      </div>
    </button>
  )
}
