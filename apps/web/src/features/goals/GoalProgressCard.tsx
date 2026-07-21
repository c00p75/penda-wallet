import { formatMoney } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import type { HeroTone } from '@/components/ui/hero-card'
import type { SavingsContribution, SavingsGoal } from './types'
import { estimateGoalCompletion } from './forecast'

interface GoalProgressCardProps {
  goal: SavingsGoal
  contributions: SavingsContribution[]
  currency: string
  onSelect: () => void
  onAddFunds: () => void
  tone?: HeroTone
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const HERO_BG: Record<HeroTone, string> = {
  iris: 'linear-gradient(145deg, var(--iris-hero-from) 0%, var(--iris-hero-to) 100%)',
  apricot: 'linear-gradient(145deg, var(--apricot-hero-from) 0%, var(--apricot-hero-to) 100%)',
  sun: 'linear-gradient(145deg, var(--sun-hero-from) 0%, var(--sun-hero-to) 100%)',
  mint: 'linear-gradient(145deg, var(--mint-hero-from) 0%, var(--mint-hero-to) 100%)',
  rose: 'linear-gradient(145deg, var(--rose-hero-from) 0%, var(--rose-hero-to) 100%)',
}

const HERO_GLOW: Record<HeroTone, string> = {
  iris: 'var(--iris-hero-glow)',
  apricot: 'var(--apricot-hero-glow)',
  sun: 'var(--sun-hero-glow)',
  mint: 'var(--mint-hero-glow)',
  rose: 'var(--rose-hero-glow)',
}

export function GoalProgressCard({
  goal,
  contributions,
  currency,
  onSelect,
  onAddFunds,
  tone = 'iris',
}: GoalProgressCardProps) {
  const pct = goal.target_amount_minor > 0 ? goal.current_amount_minor / goal.target_amount_minor : 0
  const forecast = estimateGoalCompletion(goal, contributions)
  const reached = pct >= 1
  const activeTone: HeroTone = reached ? 'iris' : tone
  const ringPct = Math.round(Math.min(pct, 1) * 100)
  const remaining = Math.max(0, goal.target_amount_minor - goal.current_amount_minor)

  const forecastLine =
    forecast.kind === 'reached'
      ? 'Goal reached'
      : forecast.kind === 'projected'
        ? `On pace · done by ${formatDate(forecast.projectedDate!)}`
        : forecast.kind === 'not-saving'
          ? 'Paused. Add funds to get moving'
          : 'Add funds to start tracking your pace'

  return (
    <div
      className="relative isolate overflow-hidden rounded-[1.75rem] p-5 text-white"
      style={{ background: HERO_BG[activeTone], boxShadow: HERO_GLOW[activeTone] }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'var(--hero-card-scrim)' }}
      />
      <button type="button" onClick={onSelect} className="relative z-10 flex w-full items-center gap-4 text-left">
        <div
          className="grid size-[4.5rem] shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(white ${ringPct}%, color-mix(in srgb, white 28%, transparent) 0)`,
          }}
        >
          <div className="grid size-[3.35rem] place-items-center rounded-full bg-white/20 text-sm font-bold tabular-nums backdrop-blur-sm">
            {ringPct}%
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-base font-semibold">
            {goal.icon && <span aria-hidden>{goal.icon}</span>}
            <span className="truncate">{goal.name}</span>
          </p>
          <p className="mt-1 text-sm tabular-nums text-white/90">
            <HiddenAmount>{formatMoney(goal.current_amount_minor, currency)}</HiddenAmount>
            <span className="text-white/70">
              {' of '}
              <HiddenAmount>{formatMoney(goal.target_amount_minor, currency)}</HiddenAmount>
            </span>
          </p>
          <p className="mt-1 text-xs font-medium text-white/75">
            {reached ? (
              'Goal reached'
            ) : (
              <>
                <HiddenAmount>{formatMoney(remaining, currency)}</HiddenAmount>
                {' to go'}
                {goal.target_date && <> · target {formatDate(goal.target_date)}</>}
              </>
            )}
          </p>
          {!reached && (
            <p className="mt-0.5 text-xs text-white/65">{forecastLine}</p>
          )}
        </div>
      </button>

      <div className="relative z-10 mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAddFunds}
          className="rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm hover:bg-white/30"
        >
          Add funds
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm hover:bg-white/20"
        >
          Details
        </button>
      </div>
    </div>
  )
}
