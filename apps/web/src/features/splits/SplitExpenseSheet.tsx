import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetClose } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney, toMinorUnits } from '@/lib/money'
import { supabase } from '@/lib/supabase/client'
import type { Transaction } from '@/features/transactions/types'

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
    const even = transaction.amount_minor / Math.max(members.length, 1)
    const next: Record<string, string> = {}
    for (const m of members) {
      next[m.user_id] = (even / 100).toFixed(2)
    }
    setShares(next)
  }, [open, transaction, members])

  async function save() {
    if (!transaction) return
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
      const rows = members.map((m) => ({
        split_id: split.id,
        member_user_id: m.user_id,
        share_minor: toMinorUnits(Number(shares[m.user_id]) || 0),
        settled: m.user_id === currentUserId,
      }))
      const { error: shareError } = await supabase.from('expense_split_shares').insert(rows)
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Split {formatMoney(transaction.amount_minor, currency)}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-sm text-muted-foreground">
            {transaction.merchant || 'Expense'} — edit each person’s share, then settle up later.
          </p>
          {members.map((m) => (
            <div key={m.user_id} className="flex flex-col gap-1">
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
