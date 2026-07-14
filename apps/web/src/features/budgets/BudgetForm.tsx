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
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Category } from '@/features/categories/types'
import type { Budget, BudgetInput, BudgetPeriod } from './types'
import { fromMinorUnits, toMinorUnits } from '@/lib/money'

interface BudgetFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  currency: string
  budget?: Budget | null
  onSubmit: (input: BudgetInput) => Promise<void>
  onDelete?: () => Promise<void>
  isSubmitting?: boolean
}

export function BudgetForm({
  open,
  onOpenChange,
  categories,
  currency,
  budget,
  onSubmit,
  onDelete,
  isSubmitting,
}: BudgetFormProps) {
  const [categoryId, setCategoryId] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<BudgetPeriod>('monthly')
  const [rollover, setRollover] = useState(false)

  useEffect(() => {
    if (!open) return
    if (budget) {
      setCategoryId(budget.category_id ?? '')
      setAmount(fromMinorUnits(budget.amount_minor).toString())
      setPeriod(budget.period)
      setRollover(budget.rollover)
    } else {
      setCategoryId('')
      setAmount('')
      setPeriod('monthly')
      setRollover(false)
    }
  }, [open, budget])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountNumber = Number(amount)
    if (!amountNumber || amountNumber <= 0) return

    await onSubmit({
      category_id: categoryId || null,
      amount_minor: toMinorUnits(amountNumber),
      period,
      rollover,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{budget ? 'Edit budget' : 'New budget'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="budget-category" className="w-full">
                <SelectValue placeholder="Overall (all categories)" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.icon ? `${category.icon} ` : ''}
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-amount">Amount</Label>
            <Input
              id="budget-amount"
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
            <Label>Period</Label>
            <ToggleGroup
              type="single"
              value={period}
              onValueChange={(v) => v && setPeriod(v as BudgetPeriod)}
              className="w-full"
            >
              <ToggleGroupItem value="weekly" className="flex-1">
                Weekly
              </ToggleGroupItem>
              <ToggleGroupItem value="monthly" className="flex-1">
                Monthly
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="budget-rollover">Roll over unused amount</Label>
              <p className="text-xs text-muted-foreground">
                Carry what you don't spend into the next period.
              </p>
            </div>
            <Switch id="budget-rollover" checked={rollover} onCheckedChange={setRollover} />
          </div>

          <p className="text-xs text-muted-foreground">Amounts are in {currency}.</p>

          <SheetFooter className="flex-row gap-2 px-0">
            {budget && onDelete && (
              <Button type="button" variant="destructive" onClick={onDelete} className="flex-1">
                Delete
              </Button>
            )}
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {budget ? 'Save' : 'Add'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
