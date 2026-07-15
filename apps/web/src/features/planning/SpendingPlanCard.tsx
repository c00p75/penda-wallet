import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { formatMoney, fromMinorUnits, toMinorUnits } from '@/lib/money'
import type { Transaction } from '@/features/transactions/types'
import type { RecurringTransaction } from '@/features/recurring/types'
import type { SavingsGoal } from '@/features/goals/types'
import { totalMonthlyGoalReserve } from '@/features/goals/goalContribution'
import { useChatStore } from '@/features/chat/chatStore'
import { useSpendingPlan, useUpsertSpendingPlan } from './hooks'
import { computeSafeToSpend, computeSpendingPlanStatus, type SpendingPlanPace } from './spendingPlan'
import { detectRecurringSpend, splitActualSpend, upcomingFixedCosts, type RecurringCandidate } from './fixedCosts'

const PACE_COPY: Record<SpendingPlanPace, { label: string; className: string }> = {
  ahead: { label: 'Ahead of plan', className: 'text-emerald-600 dark:text-emerald-400' },
  'on-track': { label: 'On track', className: 'text-primary' },
  'over-pace': { label: 'Spending fast', className: 'text-amber-600 dark:text-amber-400' },
  over: { label: 'Over plan', className: 'text-rose-600 dark:text-rose-400' },
}

function monthStartOf(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function monthEndOf(now: Date): string {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
  return end.toISOString().slice(0, 10)
}

function todayStr(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * The seed Penda replies to when the user asks for help planning. Framed as the
 * user's own ask so it reads naturally in the thread, but it carries the guard
 * rails from the roadmap: propose a few items, infer what you can, keep it short.
 * Detected recurring spend is named explicitly so the AI treats it as already
 * known — "ask only what can't be inferred" — instead of asking about it.
 */
function assistPrompt(
  amount: number,
  currency: string,
  monthLabel: string,
  detected: RecurringCandidate[],
): string {
  const base =
    `I just set my ${monthLabel} spending plan at ${currency} ${amount.toLocaleString()}. ` +
    `Help me split it into a few budget categories — look at how I've been spending, ` +
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
  recurring = [],
  goals = [],
}: {
  walletId: string
  currency: string
  transactions: Transaction[]
  recurring?: RecurringTransaction[]
  goals?: SavingsGoal[]
}) {
  const now = new Date()
  const month = monthStartOf(now)
  const monthLabel = now.toLocaleDateString(undefined, { month: 'long' })

  const { data: plan } = useSpendingPlan(walletId, month)
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
    .reduce((sum, tx) => sum + tx.amount_minor, 0)

  // Fixed spend Penda has noticed on its own (rent, subscriptions) even where
  // no recurring rule was registered — so the assist can skip asking about it.
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
      // The plan is already saved — the assist is an offer on top, never a gate.
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

  // Empty / editing state — set the intention.
  if (!plan || editing) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Target className="size-5 text-primary" />
          <p className="font-medium">This month, I intend to spend…</p>
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={plan ? fromMinorUnits(plan.intended_amount_minor).toString() : '12000'}
          />
          <Button onClick={saveIntention} disabled={upsert.isPending}>
            Set plan
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A single intention for {monthLabel} — Penda paces you against it. Amounts in {currency}.
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

  // Safe-to-spend: reserve the fixed bills still due this month AND what's
  // needed to stay on pace toward savings goals (goals as budget lines —
  // a goal you're not funding this month shouldn't quietly count as "free"),
  // then see what's genuinely left. Fixed vs flexible actuals give the reserve
  // context.
  const split = splitActualSpend(transactions, month, new Set(detected.map((d) => d.key)))
  const upcomingFixed = upcomingFixedCosts(recurring, todayStr(now), monthEndOf(now))
  const goalReserve = totalMonthlyGoalReserve(goals, now)
  const safe = computeSafeToSpend({
    intendedMinor: plan.intended_amount_minor,
    spentMinor,
    upcomingFixedMinor: upcomingFixed.totalMinor + goalReserve,
    monthStart: month,
    now,
  })
  const hasReserve = upcomingFixed.totalMinor > 0 || goalReserve > 0
  const overcommitted = safe.discretionaryRemainingMinor < 0

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{monthLabel} plan</p>
          <p className="text-lg font-semibold">
            {formatMoney(spentMinor, currency)}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              of {formatMoney(plan.intended_amount_minor, currency)}
            </span>
          </p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="text-sm text-primary">
          Edit
        </button>
      </div>

      {/* The headline number — what's genuinely free after reserving fixed bills. */}
      <div className={cn('rounded-xl px-3 py-2.5', overcommitted ? 'bg-rose-500/5' : 'bg-primary/5')}>
        <p className="text-xs text-muted-foreground">Safe to spend</p>
        {status.daysLeft > 0 && !overcommitted ? (
          <p className="text-2xl font-semibold text-primary">
            {formatMoney(safe.perDayMinor, currency)}
            <span className="text-sm font-normal text-muted-foreground">/day</span>
          </p>
        ) : (
          <p className={cn('text-2xl font-semibold', overcommitted ? 'text-rose-600 dark:text-rose-400' : 'text-primary')}>
            {overcommitted ? 'Nothing spare' : 'Last day'}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {hasReserve
            ? `After reserving ${formatMoney(upcomingFixed.totalMinor, currency)} for bills${
                goalReserve > 0 ? ` and ${formatMoney(goalReserve, currency)} toward goals` : ''
              } still due this month.`
            : 'No fixed bills or goal contributions left this month — this is your everyday spend.'}
        </p>
      </div>

      <Progress value={pct} />

      <div className="flex items-center justify-between text-sm">
        <span className={cn('font-medium', pace.className)}>{pace.label}</span>
        <span className="text-muted-foreground">
          {status.daysLeft > 0 ? `${status.daysLeft} days left` : 'Last day'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        On this pace you’ll finish around {formatMoney(status.projectedMinor, currency)}.
        {split.fixedMinor > 0 &&
          ` So far ${formatMoney(split.fixedMinor, currency)} fixed · ${formatMoney(split.flexibleMinor, currency)} flexible.`}
      </p>

      <Button
        variant="outline"
        size="sm"
        onClick={planWithPenda}
        className="self-start gap-1.5 text-primary"
      >
        <Sparkles className="size-4" />
        Plan it with Penda
      </Button>

      {nearMonthEnd && (
        <div className="flex flex-col gap-2 border-t pt-3">
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
