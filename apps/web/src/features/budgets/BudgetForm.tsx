import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet'
import { ArrowUpRightIcon } from '@/components/icons/product'
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
import { isBalanceAdjustmentCategory } from '@penda/money-core'
import type { Category } from '@/features/categories/types'
import type { Budget, BudgetInput, BudgetPeriod } from './types'
import { fromMinorUnits, toMinorUnits } from '@/lib/money'
import { localDateStr } from '@/lib/dates'

interface BudgetFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  currency: string
  budget?: Budget | null
  onSubmit: (input: BudgetInput) => Promise<void>
  onDelete?: () => Promise<void>
  isSubmitting?: boolean
  /** Leave chat and go to the list/hub page (label e.g. "View budgets"). */
  onOpenInApp?: () => void
  openInAppLabel?: string
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
  onOpenInApp,
  openInAppLabel = 'View budgets',
}: BudgetFormProps) {
  const [categoryId, setCategoryId] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<BudgetPeriod>('monthly')
  const [rollover, setRollover] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    if (!open) return
    if (budget) {
      setCategoryId(budget.category_id ?? '')
      setAmount(fromMinorUnits(budget.amount_minor).toString())
      setPeriod(budget.period)
      setRollover(budget.rollover)
      setStartDate(budget.period === 'custom' ? budget.start_date : localDateStr())
      setEndDate(budget.period === 'custom' ? (budget.end_date ?? '') : '')
    } else {
      setCategoryId('')
      setAmount('')
      setPeriod('monthly')
      setRollover(false)
      setStartDate(localDateStr())
      setEndDate('')
    }
  }, [open, budget])

  const customRangeInvalid = period === 'custom' && (!startDate || !endDate || endDate < startDate)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountNumber = Number(amount)
    if (!amountNumber || amountNumber <= 0) return
    if (customRangeInvalid) return

    await onSubmit({
      category_id: categoryId || null,
      amount_minor: toMinorUnits(amountNumber),
      period,
      rollover: period === 'custom' ? false : rollover,
      ...(period === 'custom' ? { start_date: startDate, end_date: endDate } : { end_date: null }),
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
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
                {categories
                  .filter((category) => !isBalanceAdjustmentCategory(category.name))
                  .map((category) => (
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
              <ToggleGroupItem value="custom" className="flex-1">
                Custom
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {period === 'custom' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="budget-start-date">Starts</Label>
                  <Input
                    id="budget-start-date"
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="budget-end-date">Ends</Label>
                  <Input
                    id="budget-end-date"
                    type="date"
                    required
                    min={startDate || undefined}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              {startDate && endDate && endDate < startDate && (
                <p className="text-xs text-destructive">End date must be on or after the start date.</p>
              )}
            </div>
          )}

          {period !== 'custom' && (
            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-secondary/30 p-4 shadow-[var(--shadow-soft)]">
              <div>
                <Label htmlFor="budget-rollover">Roll over unused amount</Label>
                <p className="text-xs text-muted-foreground">
                  Carry what you don't spend into the next period.
                </p>
              </div>
              <Switch id="budget-rollover" checked={rollover} onCheckedChange={setRollover} />
            </div>
          )}

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
            <Button type="submit" disabled={isSubmitting || customRangeInvalid} className="flex-1">
              {budget ? 'Save' : 'Add'}
            </Button>
          </SheetFooter>

          {onOpenInApp && budget && (
            <Button
              type="button"
              variant="link"
              className="h-auto gap-1.5 self-center text-muted-foreground"
              onClick={onOpenInApp}
            >
              {openInAppLabel}
              <ArrowUpRightIcon className="size-3.5" />
            </Button>
          )}
        </form>
      </SheetContent>
    </Sheet>
  )
}
