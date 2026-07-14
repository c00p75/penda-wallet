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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { toMinorUnits } from '@/lib/money'

interface ContributionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  goalName: string
  onSubmit: (amountMinor: number, date: string) => Promise<void>
  isSubmitting?: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

export function ContributionForm({ open, onOpenChange, goalName, onSubmit, isSubmitting }: ContributionFormProps) {
  const [direction, setDirection] = useState<'add' | 'withdraw'>('add')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())

  useEffect(() => {
    if (!open) return
    setDirection('add')
    setAmount('')
    setDate(today())
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountNumber = Number(amount)
    if (!amountNumber || amountNumber <= 0) return

    const signedMinor = toMinorUnits(amountNumber) * (direction === 'withdraw' ? -1 : 1)
    await onSubmit(signedMinor, date)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{goalName}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <ToggleGroup
            type="single"
            value={direction}
            onValueChange={(v) => v && setDirection(v as 'add' | 'withdraw')}
            className="w-full"
          >
            <ToggleGroupItem value="add" className="flex-1">
              Add funds
            </ToggleGroupItem>
            <ToggleGroupItem value="withdraw" className="flex-1">
              Withdraw
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contribution-amount">Amount</Label>
            <Input
              id="contribution-amount"
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
            <Label htmlFor="contribution-date">Date</Label>
            <Input id="contribution-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <SheetFooter className="flex-row gap-2 px-0">
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {direction === 'withdraw' ? 'Withdraw' : 'Add'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
