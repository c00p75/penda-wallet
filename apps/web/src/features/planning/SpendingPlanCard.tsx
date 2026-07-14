import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { formatMoney, fromMinorUnits, toMinorUnits } from '@/lib/money'
import type { Transaction } from '@/features/transactions/types'
import { useSpendingPlan, useUpsertSpendingPlan } from './hooks'
import { computeSpendingPlanStatus, type SpendingPlanPace } from './spendingPlan'

const PACE_COPY: Record<SpendingPlanPace, { label: string; className: string }> = {
  ahead: { label: 'Ahead of plan', className: 'text-emerald-600 dark:text-emerald-400' },
  'on-track': { label: 'On track', className: 'text-primary' },
  'over-pace': { label: 'Spending fast', className: 'text-amber-600 dark:text-amber-400' },
  over: { label: 'Over plan', className: 'text-rose-600 dark:text-rose-400' },
}

function monthStartOf(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
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

  const { data: plan } = useSpendingPlan(walletId, month)
  const upsert = useUpsertSpendingPlan(walletId)

  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [reflection, setReflection] = useState('')

  useEffect(() => {
    setReflection(plan?.reflection ?? '')
  }, [plan?.reflection])

  const spentMinor = transactions
    .filter((tx) => tx.type === 'expense' && tx.transaction_date >= month)
    .reduce((sum, tx) => sum + tx.amount_minor, 0)

  async function saveIntention() {
    const value = Number(amount)
    if (!value || value <= 0) return
    try {
      await upsert.mutateAsync({
        month,
        intended_amount_minor: toMinorUnits(value),
        reflection: plan?.reflection ?? null,
      })
      setEditing(false)
      toast(`Plan set for ${monthLabel}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
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

      <Progress value={pct} />

      <div className="flex items-center justify-between text-sm">
        <span className={cn('font-medium', pace.className)}>{pace.label}</span>
        <span className="text-muted-foreground">
          {status.daysLeft > 0
            ? `${formatMoney(status.dailyAllowanceMinor, currency)}/day left`
            : 'Last day'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        On this pace you’ll finish around {formatMoney(status.projectedMinor, currency)}.
      </p>

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
