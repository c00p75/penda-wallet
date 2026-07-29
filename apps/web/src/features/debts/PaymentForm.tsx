import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { defaultAccountId } from '@/features/accounts/hooks'
import type { Account } from '@/features/accounts/types'

interface PaymentFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  debtName: string
  /** Pockets available to pay from/into. Hidden when a wallet has none yet. */
  accounts?: Account[]
  onSubmit: (amountMinor: number, date: string, accountId: string | null) => Promise<void>
  isSubmitting?: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

export function PaymentForm({
  open,
  onOpenChange,
  debtName,
  accounts = [],
  onSubmit,
  isSubmitting,
}: PaymentFormProps) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [accountId, setAccountId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    setAmount('')
    setDate(today())
    setAccountId(defaultAccountId(accounts) ?? '')
    // Re-run only when the sheet opens for a (possibly different) debt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountNumber = Number(amount)
    if (!amountNumber || amountNumber <= 0) return

    await onSubmit(Math.round(amountNumber * 100), date, accountId || null)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle>Log payment, {debtName}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-amount">Amount</Label>
            <Input
              id="payment-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-date">Date</Label>
            <Input id="payment-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {accounts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>Pocket</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose pocket" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.icon ? `${a.icon} ` : ''}
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <SheetFooter className="flex-row gap-2 px-0">
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              Log payment
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
