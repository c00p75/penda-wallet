import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronRight, MoreVertical } from 'lucide-react'
import { Sparkle, Target, TrendDown, TrendUp } from '@/components/icons/product'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cardAccentClass } from '@/components/ui/cardAccent'
import { cn } from '@/lib/utils'
import { formatMoney, fromMinorUnits, toMinorUnits } from '@/lib/money'
import { currencySymbol } from '@/lib/currencies'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { localMonthEnd, localMonthStart } from '@/lib/dates'
import type { Transaction } from '@/features/transactions/types'
import { useChatStore } from '@/features/chat/chatStore'
import { useDeleteSpendingPlan, useSpendingPlan, useUpsertSpendingPlan } from './hooks'
import { computeSpendingPlanStatus, type SpendingPlanPace } from './spendingPlan'
import { detectRecurringSpend, type RecurringCandidate } from './fixedCosts'
import { computeRetro, previousMonthStart } from './retro'
import { computeIncomeBaseline } from './incomeBaseline'

const PACE_COPY: Record<SpendingPlanPace, { label: string; className: string }> = {
  ahead: { label: 'Ahead of plan', className: 'text-emerald-600 dark:text-emerald-400' },
  'on-track': { label: 'On track', className: 'text-primary' },
  'over-pace': { label: 'Spending fast', className: 'text-amber-600 dark:text-amber-400' },
  over: { label: 'Over plan', className: 'text-rose-600 dark:text-rose-400' },
}

function PlanOverflowMenu({
  disabled,
  onDelete,
}: {
  disabled?: boolean
  onDelete: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Plan options"
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <MoreVertical className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 gap-0 p-1.5">
        <button
          type="button"
          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          onClick={() => {
            setOpen(false)
            void onDelete()
          }}
        >
          Delete plan
        </button>
      </PopoverContent>
    </Popover>
  )
}

const PACE_CHIP: Record<
  SpendingPlanPace,
  { bg: string; fg: string; iconBg: string; iconFg: string }
> = {
  ahead: {
    bg: 'var(--mint-soft)',
    fg: 'var(--mint)',
    iconBg: 'color-mix(in srgb, var(--mint) 18%, transparent)',
    iconFg: 'var(--mint)',
  },
  'on-track': {
    bg: 'var(--iris-soft)',
    fg: 'var(--iris)',
    iconBg: 'color-mix(in srgb, var(--iris) 18%, transparent)',
    iconFg: 'var(--iris)',
  },
  'over-pace': {
    bg: 'var(--apricot-soft)',
    fg: 'var(--apricot)',
    iconBg: 'color-mix(in srgb, var(--apricot) 18%, transparent)',
    iconFg: 'var(--apricot)',
  },
  over: {
    bg: 'var(--rose-soft)',
    fg: 'var(--rose)',
    iconBg: 'color-mix(in srgb, var(--rose) 18%, transparent)',
    iconFg: 'var(--rose)',
  },
}

function monthStartOf(now: Date): string {
  return localMonthStart(now)
}

function monthEndOf(now: Date): string {
  return localMonthEnd(now)
}

/**
 * The seed Penda replies to when the user asks for help planning. Framed as the
 * user's own ask so it reads naturally in the thread, but it carries the guard
 * rails from the roadmap: propose a few items, infer what you can, keep it short.
 * Detected recurring spend is named explicitly so the AI treats it as already
 * known, "ask only what can't be inferred", instead of asking about it.
 */
function assistPrompt(
  amount: number,
  currency: string,
  monthLabel: string,
  detected: RecurringCandidate[],
): string {
  const base =
    `I just set my ${monthLabel} spending plan at ${currency} ${amount.toLocaleString()}. ` +
    `Help me split it into a few budget categories, look at how I've been spending, ` +
    `suggest 2–3 amounts that fit the plan, and only ask me about things you can't work ` +
    `out yourself. Keep it short.`
  if (detected.length === 0) return base
  const fixedList = detected
    .slice(0, 5)
    .map(
      (d) =>
        `${d.label} (~${currency} ${fromMinorUnits(d.averageAmountMinor).toLocaleString()}/${d.cadence === 'weekly' ? 'wk' : 'mo'})`,
    )
    .join(', ')
  return (
    `${base} I already treat these as fixed recurring costs, so don't ask me about them: ${fixedList}.`
  )
}

export function SpendingPlanCard({
  walletId,
  currency,
  transactions,
  /** `compact` = one-line plan summary for the steer journey (edit expands in place). */
  variant = 'default',
}: {
  walletId: string
  currency: string
  transactions: Transaction[]
  variant?: 'default' | 'compact'
}) {
  const now = new Date()
  const month = monthStartOf(now)
  const monthLabel = now.toLocaleDateString(undefined, { month: 'long' })
  const prevMonth = previousMonthStart(month)
  const prevMonthLabel = new Date(`${prevMonth}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long' })

  const { data: plan } = useSpendingPlan(walletId, month)
  const { data: prevPlan } = useSpendingPlan(walletId, prevMonth)
  const upsert = useUpsertSpendingPlan(walletId)
  const removePlan = useDeleteSpendingPlan(walletId, month)
  const openChat = useChatStore((s) => s.openChat)

  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [reflection, setReflection] = useState('')
  const sym = currencySymbol(currency)

  useEffect(() => {
    setReflection(plan?.reflection ?? '')
  }, [plan?.reflection])

  const spentMinor = transactions
    .filter((tx) => tx.type === 'expense' && tx.transaction_date >= month)
    .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)

  // Fixed spend Penda has noticed on its own (rent, subscriptions) even where
  // no recurring rule was registered, so the assist can skip asking about it.
  const detected = detectRecurringSpend(transactions, { now })

  function startEditing() {
    if (plan) {
      setAmount(String(fromMinorUnits(plan.intended_amount_minor)))
    }
    setEditing(true)
  }

  async function saveIntention() {
    const value = Number(amount)
    if (!value || value <= 0) return
    // A brand-new plan (not an edit) triggers the AI-first assist below.
    const wasNew = !plan
    try {
      await upsert.mutateAsync({
        month,
        intended_amount_minor: toMinorUnits(value),
        reflection: plan?.reflection ?? null,
      })
      setEditing(false)
      // The plan is already saved, the assist is an offer on top, never a gate.
      // Penda speaks first (autoSend) with a few tappable category suggestions;
      // the sheet is freely dismissible for anyone who'd rather do it themselves.
      if (wasNew) {
        toast(`Plan set for ${monthLabel}. Penda has a few ideas…`)
        openChat(assistPrompt(value, currency, monthLabel, detected), { autoSend: true })
      } else {
        toast(`Plan updated for ${monthLabel}.`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  function planWithPenda() {
    if (!plan) return
    openChat(assistPrompt(fromMinorUnits(plan.intended_amount_minor), currency, monthLabel, detected), {
      autoSend: true,
    })
  }

  async function saveReflection() {
    if (!plan) return
    try {
      await upsert.mutateAsync({
        month,
        intended_amount_minor: plan.intended_amount_minor,
        reflection: reflection.trim() || null,
      })
      toast('Reflection saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function deletePlan() {
    if (!plan) return
    try {
      await removePlan.mutateAsync(plan.id)
      setEditing(false)
      setAmount('')
      toast(`Deleted ${monthLabel} plan.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  // End-of-period retro: how last month actually went, computed the moment a
  // new month starts with no plan yet, it seeds the next plan (a rounded
  // read of last month's actual spend) instead of leaving the input blank.
  const retro = !plan && prevPlan ? computeRetro(prevPlan.intended_amount_minor, prevMonth, transactions) : null
  const retroSeedMinor = retro ? Math.round(retro.spentMinor / 10_000) * 10_000 : null

  // Variable/irregular income: when income swings enough that the average
  // would overstate what's reliably there, plan off the conservative
  // baseline instead, and prefer it over the retro seed, since it protects
  // against a lean month rather than just repeating last month's spend.
  const incomeBaseline = !plan ? computeIncomeBaseline(transactions, now) : null
  const seedAmountMinor =
    incomeBaseline?.isIrregular ? incomeBaseline.conservativeMinor : (retroSeedMinor ?? incomeBaseline?.conservativeMinor ?? null)

  // Prefill new-plan form when a seed is available and the field is still empty.
  useEffect(() => {
    if (plan || editing || amount) return
    if (seedAmountMinor != null) setAmount(String(fromMinorUnits(seedAmountMinor)))
  }, [plan, editing, amount, seedAmountMinor])

  // Empty / editing state, set the intention.
  if (!plan || editing) {
    const isEdit = !!plan && editing
    const seedPlaceholder = seedAmountMinor
      ? fromMinorUnits(seedAmountMinor).toString()
      : '12000'

    return (
      <div
        className={cn(
          'flex flex-col gap-3.5 rounded-[1.5rem] bg-card p-4 shadow-[var(--shadow-soft)]',
          cardAccentClass(isEdit ? 'iris' : undefined),
        )}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--iris-soft)] text-[var(--iris)]">
            <Target className="size-5" weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">
              {isEdit
                ? `Edit ${monthLabel} spending limit`
                : `How much do you want to spend in ${monthLabel}?`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isEdit
                ? 'Change your spending limit. Envelopes stay as they are until you adjust them.'
                : 'This is your spending limit, not your wallet balance. Next you’ll split it into envelopes.'}
            </p>
          </div>
          {isEdit && (
            <PlanOverflowMenu
              disabled={removePlan.isPending || upsert.isPending}
              onDelete={deletePlan}
            />
          )}
        </div>

        {retro && (
          <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{prevMonthLabel} recap: </span>
            {retro.pace === 'under' &&
              `You spent ${formatMoney(retro.spentMinor, currency)}, ${formatMoney(retro.deltaMinor, currency)} under plan. Nice.`}
            {retro.pace === 'over' &&
              `You spent ${formatMoney(retro.spentMinor, currency)}, ${formatMoney(-retro.deltaMinor, currency)} over plan.`}
            {retro.pace === 'on-target' &&
              `You landed right on plan at ${formatMoney(retro.spentMinor, currency)}.`}
          </div>
        )}
        {incomeBaseline?.isIrregular && (
          <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Income varies month to month, </span>
            planning around {formatMoney(incomeBaseline.conservativeMinor, currency)} (your leanest of the last{' '}
            {incomeBaseline.monthsConsidered} months) rather than your average, so a quiet month doesn't catch you
            out.
          </div>
        )}

        <div className="flex items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2 ring-1 ring-border/60 focus-within:ring-primary/40">
          <span className="shrink-0 text-sm font-semibold text-muted-foreground">{sym}</span>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder={isEdit ? undefined : seedPlaceholder}
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="flex gap-2">
          {isEdit && (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setEditing(false)
                setAmount('')
              }}
              disabled={removePlan.isPending}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            className="flex-1"
            onClick={saveIntention}
            disabled={upsert.isPending || removePlan.isPending || !amount || Number(amount) <= 0}
          >
            {isEdit ? 'Save spending limit' : 'Set spending limit'}
          </Button>
        </div>
      </div>
    )
  }

  const status = computeSpendingPlanStatus({
    intendedMinor: plan.intended_amount_minor,
    spentMinor,
    monthStart: month,
    now,
  })
  const pace = PACE_COPY[status.pace]
  const pct = Math.min(100, Math.round((spentMinor / plan.intended_amount_minor) * 100))
  const nearMonthEnd = status.daysLeft <= 5

  // How this month's spend-to-date compares with last month's, for the overview card's trend line.
  const prevMonthEnd = monthEndOf(new Date(`${prevMonth}T00:00:00Z`))
  const prevMonthSpentMinor = transactions
    .filter((tx) => tx.type === 'expense' && tx.transaction_date >= prevMonth && tx.transaction_date <= prevMonthEnd)
    .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)
  const vsLastMonthMinor = prevMonthSpentMinor - spentMinor

  const remainingMinor = plan.intended_amount_minor - spentMinor
  const paceAccent =
    status.pace === 'over' || status.pace === 'over-pace'
      ? 'rose'
      : status.pace === 'ahead'
        ? 'mint'
        : 'iris'

  // Steer journey: same three-band structure as edit (header → amount → actions).
  if (variant === 'compact') {
    const chip = PACE_CHIP[status.pace]
    return (
      <div
        className={cn(
          'flex w-full flex-col gap-3.5 rounded-[1.5rem] bg-card p-4 shadow-[var(--shadow-soft)]',
          cardAccentClass(paceAccent),
        )}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-2xl"
            style={{ background: chip.iconBg, color: chip.iconFg }}
          >
            <Target className="size-5" weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-semibold leading-tight">{monthLabel} plan</p>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: chip.bg, color: chip.fg }}
              >
                {pace.label}
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {status.daysLeft > 0 ? `${status.daysLeft} days left` : 'Last day'}
              {' · '}
              {pct}% used
              {prevMonthSpentMinor > 0 && (
                <>
                  {' · '}
                  <HiddenAmount>{formatMoney(Math.abs(vsLastMonthMinor), currency)}</HiddenAmount>
                  {vsLastMonthMinor >= 0 ? ' less' : ' more'} than {prevMonthLabel}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-muted/40 px-3 py-2.5 ring-1 ring-border/60">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground">
                {remainingMinor >= 0 ? 'Still okay to spend' : 'Over spending limit'}
              </p>
              <p className="mt-0.5 text-xl font-bold leading-none tracking-tight tabular-nums">
                <HiddenAmount>{formatMoney(Math.abs(remainingMinor), currency)}</HiddenAmount>
              </p>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-[11px] font-medium text-muted-foreground">Spending limit</p>
              <p className="mt-0.5 text-sm font-semibold leading-none tabular-nums">
                <HiddenAmount>{formatMoney(plan.intended_amount_minor, currency)}</HiddenAmount>
              </p>
            </div>
          </div>
          <Progress value={pct} className="mt-2.5 h-1.5" />
        </div>

        <div className="flex gap-2">
          <span className="flex h-9 min-w-0 flex-1 items-center justify-center truncate rounded-full border border-border/70 px-3 text-sm font-medium tabular-nums text-muted-foreground">
            Spent <HiddenAmount>{formatMoney(spentMinor, currency)}</HiddenAmount>
          </span>
          <button
            type="button"
            onClick={startEditing}
            className="flex h-9 flex-1 items-center justify-center gap-0.5 rounded-full bg-primary text-sm font-medium text-primary-foreground transition-transform active:scale-[0.99]"
          >
            Edit plan
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'flex flex-col gap-4 rounded-[1.5rem] bg-card p-4 shadow-[var(--shadow-soft)]',
          cardAccentClass(paceAccent),
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {monthLabel} plan
            </p>
            <p className="mt-1.5 text-2xl font-bold leading-none tracking-tight tabular-nums">
              <HiddenAmount>{formatMoney(Math.abs(remainingMinor), currency)}</HiddenAmount>
              <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                {remainingMinor >= 0 ? 'still okay to spend' : 'over limit'}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                status.pace === 'over'
                  ? 'bg-[var(--rose-soft)] text-[var(--rose)]'
                  : status.pace === 'over-pace'
                    ? 'bg-[var(--apricot-soft)] text-[var(--apricot)]'
                    : status.pace === 'ahead'
                      ? 'bg-[var(--mint-soft)] text-[var(--mint)]'
                      : 'bg-[var(--iris-soft)] text-[var(--iris)]',
              )}
            >
              {pace.label}
            </span>
            <button
              type="button"
              onClick={startEditing}
              className="text-xs font-medium text-primary"
            >
              Edit plan
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tabular-nums">
              <HiddenAmount>{formatMoney(spentMinor, currency)}</HiddenAmount>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Spent so far</p>
          </div>
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-semibold tabular-nums">
              <HiddenAmount>{formatMoney(plan.intended_amount_minor, currency)}</HiddenAmount>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Spending limit</p>
          </div>
        </div>

        <div>
          <Progress value={pct} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            {pct}% used
            {' · '}
            {status.daysLeft > 0 ? `${status.daysLeft} days left` : 'Last day'}
            {' · '}
            projected{' '}
            <HiddenAmount>{formatMoney(status.projectedMinor, currency)}</HiddenAmount>
          </p>
        </div>

        {prevMonthSpentMinor > 0 && (
          <div className="flex items-center gap-1.5 border-t border-border/60 pt-3 text-sm">
            {vsLastMonthMinor >= 0 ? (
              <TrendDown className="size-3.5 shrink-0 text-[var(--mint)]" weight="bold" />
            ) : (
              <TrendUp className="size-3.5 shrink-0 text-[var(--rose)]" weight="bold" />
            )}
            <span
              className={cn(
                'min-w-0 truncate font-medium',
                vsLastMonthMinor >= 0 ? 'text-[var(--mint)]' : 'text-[var(--rose)]',
              )}
            >
              <HiddenAmount>{formatMoney(Math.abs(vsLastMonthMinor), currency)}</HiddenAmount>
              {vsLastMonthMinor >= 0 ? ' less' : ' more'} than {prevMonthLabel}
            </span>
            <Link
              to="/analytics"
              className="ml-auto flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary"
            >
              Details
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={planWithPenda}
        className={cn(
          'flex items-center gap-3 rounded-[1.5rem] bg-card p-4 text-left shadow-[var(--shadow-soft)] transition-transform active:scale-[0.99]',
          cardAccentClass('iris'),
        )}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--iris-soft)] text-[var(--iris)]">
          <Sparkle className="size-5" weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Split with Penda</p>
          <p className="text-sm text-muted-foreground">Turn the plan into a few envelopes</p>
        </div>
      </button>

      {nearMonthEnd && (
        <div className="flex flex-col gap-2 rounded-2xl border p-4">
          <p className="text-sm font-medium">What felt worth it this month?</p>
          <Textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            rows={2}
            placeholder="The trip home was worth every kwacha. The daily takeout wasn’t."
          />
          <Button variant="outline" size="sm" onClick={saveReflection} disabled={upsert.isPending} className="self-end">
            Save reflection
          </Button>
        </div>
      )}
    </div>
  )
}
