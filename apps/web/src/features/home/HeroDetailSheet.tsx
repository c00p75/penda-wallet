import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { BottomSheetHandle, useBottomSheetDrag } from '@/components/ui/bottomSheetDrag'
import { Button } from '@/components/ui/button'
import { HeroBlob } from '@/components/ui/hero-blob'
import type { HeroTone } from '@/components/ui/hero-card'
import {
  CalendarBlankIcon,
  SparkleIcon,
  TargetIcon,
  WalletIcon,
} from '@/components/icons/product'
import { useCloseOnBack } from '@/lib/useCloseOnBack'
import { cn } from '@/lib/utils'

export type HeroDetail =
  | {
      kind: 'safe-to-spend'
      valueLabel: string
      summary: string
      bullets: string[]
    }
  | {
      kind: 'balance'
      valueLabel: string
    }
  | {
      kind: 'status'
      valueLabel: string
    }
  | {
      kind: 'goal'
      name: string
      valueLabel: string
      goalId: string
      progressLine?: string
    }
  | {
      kind: 'month'
      valueLabel: string
    }

const COPY: Record<
  HeroDetail['kind'],
  { title: string; description: string; primary: string; eyebrow: string }
> = {
  'safe-to-spend': {
    title: 'Safe to spend',
    eyebrow: 'Daily pace',
    description: 'What you can still spend per day without blowing the month plan.',
    primary: 'Open budgets',
  },
  balance: {
    title: 'Balance',
    eyebrow: 'This wallet',
    description: 'Cash in this wallet after income and spending so far.',
    primary: 'View activity',
  },
  status: {
    title: 'Status',
    eyebrow: 'Blind mode',
    description: 'A lighter read on how the month feels, without exact amounts.',
    primary: 'Open budgets',
  },
  goal: {
    title: 'Goal',
    eyebrow: 'Savings',
    description: 'How far this savings goal has come.',
    primary: 'Open goal',
  },
  month: {
    title: 'This month',
    eyebrow: 'Spending',
    description: 'Total spending logged in the current calendar month.',
    primary: 'View activity',
  },
}

const TONE: Record<HeroDetail['kind'], HeroTone> = {
  'safe-to-spend': 'iris',
  balance: 'mint',
  status: 'iris',
  goal: 'apricot',
  month: 'sun',
}

const HERO_BG: Record<HeroTone, string> = {
  iris: 'linear-gradient(145deg, var(--iris-hero-from) 0%, var(--iris-hero-to) 100%)',
  apricot: 'linear-gradient(145deg, var(--apricot-hero-from) 0%, var(--apricot-hero-to) 100%)',
  sun: 'linear-gradient(145deg, var(--sun-hero-from) 0%, var(--sun-hero-to) 100%)',
  mint: 'linear-gradient(145deg, var(--mint-hero-from) 0%, var(--mint-hero-to) 100%)',
  rose: 'linear-gradient(145deg, var(--rose-hero-from) 0%, var(--rose-hero-to) 100%)',
}

function KindIcon({ kind }: { kind: HeroDetail['kind'] }) {
  const className = 'size-5 text-white'
  if (kind === 'goal') return <TargetIcon className={className} />
  if (kind === 'month') return <CalendarBlankIcon className={className} />
  if (kind === 'status') return <SparkleIcon className={className} />
  return <WalletIcon className={className} />
}

function goalPct(valueLabel: string): number | null {
  const m = valueLabel.trim().match(/^(\d+)\s*%$/)
  if (!m) return null
  return Math.min(100, Math.max(0, Number(m[1])))
}

/** Prefer a clean headline amount when the card also shows a "per day" chip. */
function displayValue(detail: HeroDetail): string {
  if (detail.kind !== 'safe-to-spend') return detail.valueLabel
  return detail.valueLabel.replace(/\/\s*day\s*$/i, '').trim() || detail.valueLabel
}

export function HeroDetailSheet({
  detail,
  onOpenChange,
  onNavigate,
}: {
  detail: HeroDetail | null
  onOpenChange: (open: boolean) => void
  onNavigate: (href: string) => void
}) {
  const open = !!detail
  useCloseOnBack(open, () => onOpenChange(false))
  const drag = useBottomSheetDrag(() => onOpenChange(false))

  if (!detail) return null

  const copy = COPY[detail.kind]
  const tone = TONE[detail.kind]
  const title = detail.kind === 'goal' ? detail.name : copy.title
  const primaryHref =
    detail.kind === 'safe-to-spend' || detail.kind === 'status'
      ? '/budgets'
      : detail.kind === 'goal'
        ? `/goals/${detail.goalId}`
        : '/transactions'
  const pct = detail.kind === 'goal' ? goalPct(detail.valueLabel) : null
  const value = displayValue(detail)

  const supporting =
    detail.kind === 'safe-to-spend'
      ? detail.summary
      : detail.kind === 'goal' && detail.progressLine
        ? detail.progressLine
        : detail.kind === 'balance'
          ? 'Review recent income and spending that make up this number.'
          : detail.kind === 'status'
            ? 'Blind budgeting hides exact figures. Open budgets if you want to adjust the plan.'
            : detail.kind === 'month'
              ? "Open activity to see what made up this month's spend."
              : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        size="half"
        showCloseButton={false}
        className={cn(
          'gap-0 p-0',
          // Content-sized height; scroll only when the body hits the max.
          'h-auto max-h-[min(92svh,calc(100%-1.25rem))] overflow-y-auto',
        )}
        style={drag.sheetStyle}
      >
        <BottomSheetHandle {...drag.handleProps} />

        <SheetHeader className="px-5 pt-2 pb-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">{copy.eyebrow}</p>
          <SheetTitle className="text-lg">{title}</SheetTitle>
          <SheetDescription className="text-[0.9rem] leading-snug">
            {copy.description}
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 pt-4">
          <div
            className="relative isolate overflow-hidden rounded-[1.5rem] px-5 py-5 text-white ring-1 ring-black/5"
            style={{ background: HERO_BG[tone] }}
          >
            <HeroBlob tone={tone} className="-right-5 -bottom-8 size-32 rotate-12 opacity-90" />
            <div className="relative z-10 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/25"
                >
                  <KindIcon kind={detail.kind} />
                </span>
                {detail.kind === 'safe-to-spend' && (
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[0.7rem] font-medium text-white/90 ring-1 ring-white/20">
                    per day
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold tracking-tight tabular-nums leading-none">{value}</p>
              {pct != null ? (
                <div className="mt-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
                    <div
                      className="h-full rounded-full bg-white transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {detail.kind === 'goal' && detail.progressLine && (
                    <p className="mt-1.5 text-xs font-medium text-white/85">{detail.progressLine}</p>
                  )}
                </div>
              ) : detail.kind === 'goal' && detail.progressLine ? (
                <p className="text-sm font-medium text-white/90">{detail.progressLine}</p>
              ) : null}
            </div>
          </div>

          {supporting && detail.kind !== 'goal' && (
            <p className="mt-4 text-sm leading-snug text-muted-foreground">{supporting}</p>
          )}

          {detail.kind === 'safe-to-spend' && detail.bullets.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground">
                How this is calculated
              </p>
              <ul className="flex flex-col gap-2">
                {detail.bullets.map((b, i) => (
                  <li
                    key={b}
                    className="flex gap-3 rounded-2xl bg-muted/55 px-3.5 py-3 ring-1 ring-border/40"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold tabular-nums"
                      style={{
                        background: 'color-mix(in srgb, var(--iris) 16%, transparent)',
                        color: 'var(--iris)',
                      }}
                    >
                      {i + 1}
                    </span>
                    <p className="min-w-0 text-sm leading-snug text-foreground">{b}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="border-t border-border/50 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false)
                onNavigate(primaryHref)
              }}
            >
              {copy.primary}
            </Button>
            {detail.kind === 'goal' && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                  onNavigate('/goals')
                }}
              >
                All goals
              </Button>
            )}
            {(detail.kind === 'safe-to-spend' || detail.kind === 'balance') && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                  onNavigate(detail.kind === 'safe-to-spend' ? '/transactions' : '/budgets')
                }}
              >
                {detail.kind === 'safe-to-spend' ? 'View activity' : 'Open budgets'}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
