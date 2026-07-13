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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Category } from '@/features/categories/types'
import type { RecurringFrequency, RecurringInput, RecurringTransaction } from './types'
import { fromMinorUnits, toMinorUnits } from '@/lib/money'

interface RecurringFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  currency: string
  recurring?: RecurringTransaction | null
  onSubmit: (input: RecurringInput) => Promise<void>
  onDelete?: () => Promise<void>
  isSubmitting?: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

export function RecurringForm({
  open,
  onOpenChange,
  categories,
  currency,
  recurring,
  onSubmit,
  onDelete,
  isSubmitting,
}: RecurringFormProps) {
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [merchant, setMerchant] = useState('')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [nextRunDate, setNextRunDate] = useState(today())

  useEffect(() => {
    if (!open) return
    if (recurring) {
      setType(recurring.template.type)
      setAmount(fromMinorUnits(recurring.template.amount_minor).toString())
      setCategoryId(recurring.template.category_id ?? '')
      setMerchant(recurring.template.merchant ?? '')
      setFrequency(recurring.frequency)
      setNextRunDate(recurring.next_run_date)
    } else {
      setType('expense')
      setAmount('')
      setCategoryId('')
      setMerchant('')
      setFrequency('monthly')
      setNextRunDate(today())
    }
  }, [open, recurring])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountNumber = Number(amount)
    if (!amountNumber || amountNumber <= 0) return

    await onSubmit({
      template: {
        category_id: categoryId || null,
        amount_minor: toMinorUnits(amountNumber),
        currency,
        type,
        merchant: merchant || null,
        description: null,
      },
      frequency,
      next_run_date: nextRunDate,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{recurring ? 'Edit recurring transaction' : 'New recurring transaction'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <ToggleGroup
            type="single"
            value={type}
            onValueChange={(v) => v && setType(v as 'expense' | 'income')}
            className="w-full"
          >
            <ToggleGroupItem value="expense" className="flex-1">
              Expense
            </ToggleGroupItem>
            <ToggleGroupItem value="income" className="flex-1">
              Income
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring-amount">Amount</Label>
            <Input
              id="recurring-amount"
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
            <Label htmlFor="recurring-category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="recurring-category" className="w-full">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring-merchant">Merchant / label</Label>
            <Input
              id="recurring-merchant"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Netflix"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Frequency</Label>
            <ToggleGroup
              type="single"
              value={frequency}
              onValueChange={(v) => v && setFrequency(v as RecurringFrequency)}
              className="w-full"
            >
              <ToggleGroupItem value="daily" className="flex-1">
                Daily
              </ToggleGroupItem>
              <ToggleGroupItem value="weekly" className="flex-1">
                Weekly
              </ToggleGroupItem>
              <ToggleGroupItem value="monthly" className="flex-1">
                Monthly
              </ToggleGroupItem>
              <ToggleGroupItem value="yearly" className="flex-1">
                Yearly
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recurring-next-date">Next occurrence</Label>
            <Input
              id="recurring-next-date"
              type="date"
              required
              value={nextRunDate}
              onChange={(e) => setNextRunDate(e.target.value)}
            />
          </div>

          <SheetFooter className="flex-row gap-2 px-0">
            {recurring && onDelete && (
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
              {recurring ? 'Save' : 'Add'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
