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

interface PaymentFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  debtName: string
  onSubmit: (amountMinor: number, date: string) => Promise<void>
  isSubmitting?: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

export function PaymentForm({ open, onOpenChange, debtName, onSubmit, isSubmitting }: PaymentFormProps) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())

  useEffect(() => {
    if (!open) return
    setAmount('')
    setDate(today())
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountNumber = Number(amount)
    if (!amountNumber || amountNumber <= 0) return

    await onSubmit(Math.round(amountNumber * 100), date)
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
