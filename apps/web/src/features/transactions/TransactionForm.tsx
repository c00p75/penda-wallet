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
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Category } from '@/features/categories/types'
import type { Transaction, TransactionInput, TransactionType } from './types'
import { fromMinorUnits, toMinorUnits } from '@/lib/money'
import { getReceiptImageUrl } from '@/features/receipts/api'

interface TransactionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  currency: string
  transaction?: Transaction | null
  onSubmit: (input: TransactionInput) => Promise<void>
  onDelete?: () => Promise<void>
  isSubmitting?: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

export function TransactionForm({
  open,
  onOpenChange,
  categories,
  currency,
  transaction,
  onSubmit,
  onDelete,
  isSubmitting,
}: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [merchant, setMerchant] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(today())
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null)

  const isReceiptDraft = !!transaction && transaction.source === 'receipt' && !transaction.user_confirmed

  useEffect(() => {
    if (!open || !transaction?.receipt_storage_path) {
      setReceiptImageUrl(null)
      return
    }
    getReceiptImageUrl(transaction.receipt_storage_path).then(setReceiptImageUrl)
  }, [open, transaction?.receipt_storage_path])

  useEffect(() => {
    if (!open) return
    if (transaction) {
      setType(transaction.type)
      setAmount(fromMinorUnits(transaction.amount_minor).toString())
      setCategoryId(transaction.category_id ?? '')
      setMerchant(transaction.merchant ?? '')
      setDescription(transaction.description ?? '')
      setDate(transaction.transaction_date)
    } else {
      setType('expense')
      setAmount('')
      setCategoryId('')
      setMerchant('')
      setDescription('')
      setDate(today())
    }
  }, [open, transaction])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amountNumber = Number(amount)
    if (!amountNumber || amountNumber <= 0) return

    await onSubmit({
      type,
      amount_minor: toMinorUnits(amountNumber),
      currency,
      category_id: categoryId || null,
      merchant: merchant || null,
      description: description || null,
      transaction_date: date,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isReceiptDraft ? 'Confirm receipt' : transaction ? 'Edit transaction' : 'Add transaction'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          {receiptImageUrl && (
            <img
              src={receiptImageUrl}
              alt="Receipt"
              className="max-h-48 w-full rounded-lg border object-contain"
            />
          )}

          <ToggleGroup
            type="single"
            value={type}
            onValueChange={(v) => v && setType(v as TransactionType)}
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
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
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
            <Label htmlFor="category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="category" className="w-full">
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
            <Label htmlFor="merchant">Merchant</Label>
            <Input
              id="merchant"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Blue Bottle Coffee"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Notes</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <SheetFooter className="flex-row gap-2 px-0">
            {transaction && onDelete && (
              <Button type="button" variant="destructive" onClick={onDelete} className="flex-1">
                {isReceiptDraft ? 'Discard' : 'Delete'}
              </Button>
            )}
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isReceiptDraft ? 'Confirm' : transaction ? 'Save' : 'Add'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
