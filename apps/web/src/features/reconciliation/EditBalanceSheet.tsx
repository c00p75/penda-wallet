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
import { fromMinorUnits, toMinorUnits } from '@/lib/money'

interface EditBalanceSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  computedBalanceMinor: number
  onSubmit: (actualBalanceMinor: number) => Promise<void>
  isSubmitting?: boolean
}

export function EditBalanceSheet({
  open,
  onOpenChange,
  computedBalanceMinor,
  onSubmit,
  isSubmitting,
}: EditBalanceSheetProps) {
  const [actual, setActual] = useState(() => fromMinorUnits(computedBalanceMinor).toString())

  useEffect(() => {
    if (open) setActual(fromMinorUnits(computedBalanceMinor).toString())
  }, [open, computedBalanceMinor])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const actualMinor = toMinorUnits(Number(actual) || 0)
    await onSubmit(actualMinor)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle>Edit balance</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="actual-balance">What's your actual balance?</Label>
            <Input
              id="actual-balance"
              type="number"
              inputMode="decimal"
              step="0.01"
              autoFocus
              required
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              I'll add a balancing entry so future numbers stay accurate.
            </p>
          </div>

          <SheetFooter className="flex-row gap-2 px-0">
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              Save
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
