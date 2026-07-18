import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetClose } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney, fromMinorUnits, toMinorUnits } from '@/lib/money'
import { supabase } from '@/lib/supabase/client'
import type { Transaction } from '@/features/transactions/types'
import { fetchSplitForTransaction } from './api'
import { sharesSumValid } from './balances'

interface Member {
  user_id: string
  label: string
}

interface SplitExpenseSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  walletId: string
  transaction: Transaction | null
  currency: string
  members: Member[]
  currentUserId: string
}

/** Split a confirmed expense evenly (editable) across wallet members. */
export function SplitExpenseSheet({
  open,
  onOpenChange,
  walletId,
  transaction,
  currency,
  members,
  currentUserId,
}: SplitExpenseSheetProps) {
  const [shares, setShares] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !transaction) return
    let cancelled = false

    async function load() {
      const existing = await fetchSplitForTransaction(transaction!.id)
      if (cancelled) return
      if (existing?.expense_split_shares?.length) {
        const next: Record<string, string> = {}
        for (const m of members) {
          const share = (
            existing.expense_split_shares as Array<{
              member_user_id: string
              share_minor: number
            }>
          ).find((s) => s.member_user_id === m.user_id)
          next[m.user_id] = share
            ? fromMinorUnits(share.share_minor).toFixed(2)
            : '0.00'
        }
        setShares(next)
        return
      }
      const even = transaction!.amount_minor / Math.max(members.length, 1)
      const next: Record<string, string> = {}
      for (const m of members) {
        next[m.user_id] = fromMinorUnits(Math.round(even)).toFixed(2)
      }
      setShares(next)
    }

    void load().catch(() => {
      const even = transaction!.amount_minor / Math.max(members.length, 1)
      const next: Record<string, string> = {}
      for (const m of members) {
        next[m.user_id] = fromMinorUnits(Math.round(even)).toFixed(2)
      }
      setShares(next)
    })

    return () => {
      cancelled = true
    }
  }, [open, transaction, members])

  async function save() {
    if (!transaction) return
    const minors = members.map((m) => toMinorUnits(Number(shares[m.user_id]) || 0))
    if (!sharesSumValid(minors, transaction.amount_minor)) {
      toast.error(`Shares must add up to ${formatMoney(transaction.amount_minor, currency)}.`)
      return
    }
    setBusy(true)
    try {
      const { data: split, error } = await supabase
        .from('expense_splits')
        .upsert(
          {
            wallet_id: walletId,
            transaction_id: transaction.id,
            created_by: currentUserId,
          },
          { onConflict: 'transaction_id' },
        )
        .select('id')
        .single()
      if (error) throw error

      await supabase.from('expense_split_shares').delete().eq('split_id', split.id)
      const payerId = transaction.created_by
      const settledRows = members.map((m, i) => ({
        split_id: split.id,
        member_user_id: m.user_id,
        share_minor: minors[i],
        settled: m.user_id === payerId,
      }))
      const { error: shareError } = await supabase.from('expense_split_shares').insert(settledRows)
      if (shareError) throw shareError
      toast('Split saved.')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save split.')
    } finally {
      setBusy(false)
    }
  }

  if (!transaction) return null

  const sumMinor = members.reduce(
    (acc, m) => acc + toMinorUnits(Number(shares[m.user_id]) || 0),
    0,
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle>Split {formatMoney(transaction.amount_minor, currency)}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="rounded-2xl bg-secondary/30 px-3.5 py-2.5 text-sm text-muted-foreground shadow-[var(--shadow-soft)] ring-1 ring-border/50">
            {transaction.merchant || 'Expense'}, edit each person’s share, then settle up from the
            Settle up page.
          </p>
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex flex-col gap-1.5 rounded-2xl bg-secondary/30 px-3.5 py-2.5 shadow-[var(--shadow-soft)] ring-1 ring-border/50"
            >
              <Label htmlFor={`share-${m.user_id}`}>{m.label}</Label>
              <Input
                id={`share-${m.user_id}`}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={shares[m.user_id] ?? ''}
                onChange={(e) => setShares((prev) => ({ ...prev, [m.user_id]: e.target.value }))}
              />
            </div>
          ))}
          <p
            className={
              sumMinor === transaction.amount_minor
                ? 'text-xs text-muted-foreground'
                : 'text-xs text-destructive'
            }
          >
            Total {formatMoney(sumMinor, currency)} of {formatMoney(transaction.amount_minor, currency)}
          </p>
          <SheetFooter className="flex-row gap-2 px-0">
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                Cancel
              </Button>
            </SheetClose>
            <Button className="flex-1" disabled={busy || members.length === 0} onClick={save}>
              {busy ? 'Saving…' : 'Save split'}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
