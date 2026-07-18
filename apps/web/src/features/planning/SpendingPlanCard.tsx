import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronRight } from 'lucide-react'
import { Sparkle, Target, TrendDown, TrendUp } from '@/components/icons/product'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { formatMoney, fromMinorUnits, toMinorUnits } from '@/lib/money'
import { localMonthEnd, localMonthStart } from '@/lib/dates'
import type { Transaction } from '@/features/transactions/types'
import { useChatStore } from '@/features/chat/chatStore'
import { useSpendingPlan, useUpsertSpendingPlan } from './hooks'
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
}: {
  walletId: string
  currency: string
  transactions: Transaction[]
}) {
  const now = new Date()
  const month = monthStartOf(now)
  const monthLabel = now.toLocaleDateString(undefined, { month: 'long' })
  const prevMonth = previousMonthStart(month)
  const prevMonthLabel = new Date(`${prevMonth}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long' })

  const { data: plan } = useSpendingPlan(walletId, month)
  const { data: prevPlan } = useSpendingPlan(walletId, prevMonth)
  const upsert = useUpsertSpendingPlan(walletId)
  const openChat = useChatStore((s) => s.openChat)

  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [reflection, setReflection] = useState('')

  useEffect(() => {
    setReflection(plan?.reflection ?? '')
  }, [plan?.reflection])

  const spentMinor = transactions
    .filter((tx) => tx.type === 'expense' && tx.transaction_date >= month)
    .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)

  // Fixed spend Penda has noticed on its own (rent, subscriptions) even where
  // no recurring rule was registered, so the assist can skip asking about it.
  const detected = detectRecurringSpend(transactions, { now })

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

  // Empty / editing state, set the intention.
  if (!plan || editing) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Target className="size-5 text-primary" weight="duotone" />
          <p className="font-medium">This month, I intend to spend…</p>
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
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={
              plan
                ? fromMinorUnits(plan.intended_amount_minor).toString()
                : seedAmountMinor
                  ? fromMinorUnits(seedAmountMinor).toString()
                  : '12000'
            }
          />
          <Button onClick={saveIntention} disabled={upsert.isPending}>
            Set plan
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A single intention for {monthLabel}. Penda paces you against it. Amounts in {currency}.
          Set it and Penda will help you break it into budgets (or skip and do it yourself).
        </p>
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 px-1">
        <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Current overview
        </p>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">{monthLabel} plan</p>
          <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-primary">
            {pct}% used
          </button>
        </div>
      </div>

      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-3xl font-bold leading-none tracking-tight text-primary">
              {formatMoney(spentMinor, currency)}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">Spent so far</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold">{formatMoney(plan.intended_amount_minor, currency)}</p>
            <p className="text-xs text-muted-foreground">Total budget</p>
          </div>
        </div>

        <Progress value={pct} className="mt-4 h-2" />

        {prevMonthSpentMinor > 0 && (
          <div className="mt-4 flex items-center gap-1.5 border-t pt-3 text-sm">
            {vsLastMonthMinor >= 0 ? (
              <TrendDown className="size-3.5 shrink-0 text-[var(--mint)]" weight="bold" />
            ) : (
              <TrendUp className="size-3.5 shrink-0 text-[var(--rose)]" weight="bold" />
            )}
            <span className={cn('font-medium', vsLastMonthMinor >= 0 ? 'text-[var(--mint)]' : 'text-[var(--rose)]')}>
              {formatMoney(Math.abs(vsLastMonthMinor), currency)} {vsLastMonthMinor >= 0 ? 'less' : 'more'} than{' '}
              {prevMonthLabel}
            </span>
            <Link to="/analytics" className="ml-auto flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
              View Details
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
        )}
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        <span className={cn('font-medium', pace.className)}>{pace.label}</span>
        {' · '}
        {status.daysLeft > 0 ? `${status.daysLeft} days left` : 'Last day'}
        {' · '}
        projected to finish around {formatMoney(status.projectedMinor, currency)}
      </p>

      <button
        type="button"
        onClick={planWithPenda}
        className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--iris-soft)] text-[var(--iris)]">
          <Sparkle className="size-5" weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Plan it with Penda</p>
          <p className="text-sm text-muted-foreground">AI-generated financial strategy for {monthLabel}</p>
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
