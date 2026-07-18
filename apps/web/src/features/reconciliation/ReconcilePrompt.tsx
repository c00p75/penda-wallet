import { useState } from 'react'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney, fromMinorUnits, toMinorUnits } from '@/lib/money'
import { useCreateReconciliation } from './hooks'

interface ReconcilePromptProps {
  walletId: string
  userId: string
  currency: string
  computedBalanceMinor: number
  /** When set (e.g. from a MoMo SMS balance), open in Fix mode with this value pre-filled. */
  suggestedActualMinor?: number | null
  /** Called after the user resolves the prompt (confirmed or adjusted) — dismiss the card. */
  onResolved: () => void
  /** Create a balancing transaction for the difference when the user reports a different actual balance. */
  onAdjust: (deltaMinor: number) => Promise<void>
}

/**
 * The trust anchor (roadmap bet #2): a lightweight daily check that Penda's
 * computed balance still matches reality, before the user trusts anything
 * downstream (safe-to-spend, the cashflow timeline, the simulator) that's
 * built on top of it.
 */
export function ReconcilePrompt({
  walletId,
  userId,
  currency,
  computedBalanceMinor,
  suggestedActualMinor = null,
  onResolved,
  onAdjust,
}: ReconcilePromptProps) {
  const [fixing, setFixing] = useState(
    () => suggestedActualMinor != null && suggestedActualMinor !== computedBalanceMinor,
  )
  const [actual, setActual] = useState(() =>
    suggestedActualMinor != null ? fromMinorUnits(suggestedActualMinor).toString() : '',
  )
  const createReconciliation = useCreateReconciliation(walletId, userId)

  async function confirmMatch() {
    try {
      await createReconciliation.mutateAsync({
        computedBalanceMinor,
        actualBalanceMinor: computedBalanceMinor,
        status: 'confirmed',
      })
      onResolved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function submitFix() {
    const actualMinor = toMinorUnits(Number(actual) || 0)
    try {
      const delta = actualMinor - computedBalanceMinor
      if (delta !== 0) await onAdjust(delta)
      await createReconciliation.mutateAsync({
        computedBalanceMinor,
        actualBalanceMinor: actualMinor,
        status: 'adjusted',
      })
      toast('Balance reconciled.')
      onResolved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  if (fixing) {
    return (
      <div className="flex flex-col gap-2 rounded-[1.5rem] border border-border/60 bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border/50">
        <p className="text-sm font-medium">What's your actual balance?</p>
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            autoFocus
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            placeholder={fromMinorUnits(computedBalanceMinor).toString()}
          />
          <Button onClick={submitFix} disabled={createReconciliation.isPending}>
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          I'll add a balancing entry so future numbers stay accurate.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-[1.5rem] border border-border/60 bg-[var(--mint-soft)]/40 p-4 shadow-[var(--shadow-soft)] ring-1 ring-[var(--mint)]/20">
      <p className="min-w-0 flex-1 text-sm">
        Penda has <span className="font-semibold">{formatMoney(computedBalanceMinor, currency)}</span> — does that
        match your MoMo?
      </p>
      <div className="flex shrink-0 gap-1.5">
        <Button size="sm" variant="outline" onClick={() => setFixing(true)} className="gap-1">
          <X className="size-3.5" />
          Fix
        </Button>
        <Button size="sm" onClick={confirmMatch} disabled={createReconciliation.isPending} className="gap-1">
          <Check className="size-3.5" />
          Yes
        </Button>
      </div>
    </div>
  )
}
