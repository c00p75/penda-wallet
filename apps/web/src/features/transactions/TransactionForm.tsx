import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ArrowUpRightIcon } from '@/components/icons/product'
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
import { upsertCategorizationRule } from '@/features/categories/rulesApi'
import type {
  ReceiptItemsConfirmInput,
  Transaction,
  TransactionDraft,
  TransactionInput,
  TransactionType,
} from './types'
import { formatMoney, fromMinorUnits, toMinorUnits } from '@/lib/money'
import { CURRENCIES } from '@/lib/currencies'
import { getReceiptImageUrl } from '@/features/receipts/api'
import { fetchUsdRates } from '@/features/fx/api'

interface LineDraft {
  key: string
  description: string
  amount: string
  categoryId: string
}

interface TransactionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  currency: string
  walletId?: string
  transaction?: Transaction | null
  /** Pre-fill for a new transaction (parsed MoMo/SMS). Ignored when editing. */
  draft?: TransactionDraft | null
  onSubmit: (input: TransactionInput) => Promise<void>
  /** When set, Confirm can split a receipt into one ledger row per line item. */
  onConfirmItems?: (input: ReceiptItemsConfirmInput) => Promise<void>
  onDelete?: () => Promise<void>
  isSubmitting?: boolean
  /** Leave chat and go to the list/hub page (label e.g. "View transactions"). */
  onOpenInApp?: () => void
  openInAppLabel?: string
}

type ReceiptLogMode = 'combined' | 'items'

const today = () => new Date().toISOString().slice(0, 10)

function nextKey() {
  return crypto.randomUUID()
}

function categoryIdForName(name: string | null | undefined, categories: Category[], fallback: string) {
  if (!name) return fallback
  return categories.find((c) => c.name === name)?.id ?? fallback
}

function linesFromTransaction(transaction: Transaction, categories: Category[]): LineDraft[] {
  const fallback = transaction.category_id ?? ''
  const items = transaction.ai_extraction?.items
  if (items && items.length > 0) {
    return items.map((item) => ({
      key: nextKey(),
      description: item.description,
      amount: fromMinorUnits(item.amount_minor).toString(),
      categoryId: categoryIdForName(item.suggested_category, categories, fallback),
    }))
  }
  return [
    {
      key: nextKey(),
      description: transaction.description || transaction.merchant || 'Item',
      amount: fromMinorUnits(transaction.amount_minor).toString(),
      categoryId: fallback,
    },
  ]
}

export function TransactionForm({
  open,
  onOpenChange,
  categories,
  currency,
  walletId,
  transaction,
  draft,
  onSubmit,
  onConfirmItems,
  onDelete,
  isSubmitting,
  onOpenInApp,
  openInAppLabel = 'View transactions',
}: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [txCurrency, setTxCurrency] = useState(currency)
  const [categoryId, setCategoryId] = useState<string>('')
  const [merchant, setMerchant] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(today())
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null)
  const [teachPenda, setTeachPenda] = useState(false)
  const [receiptMode, setReceiptMode] = useState<ReceiptLogMode>('combined')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [ratesFetchedAt, setRatesFetchedAt] = useState<string | null>(null)

  const isReceiptDraft = !!transaction && transaction.source === 'receipt' && !transaction.user_confirmed
  const extractedItems = transaction?.ai_extraction?.items ?? []
  const canItemize = isReceiptDraft && !!onConfirmItems && extractedItems.length > 0
  const itemsMode = canItemize && receiptMode === 'items'
  const needsFx = txCurrency.toUpperCase() !== currency.toUpperCase()

  useEffect(() => {
    if (!open || !transaction?.receipt_storage_path) {
      setReceiptImageUrl(null)
      return
    }
    getReceiptImageUrl(transaction.receipt_storage_path).then(setReceiptImageUrl)
  }, [open, transaction?.receipt_storage_path])

  useEffect(() => {
    if (!open || !needsFx) {
      setRatesFetchedAt(null)
      return
    }
    let cancelled = false
    void fetchUsdRates()
      .then(({ fetchedAt }) => {
        if (!cancelled) setRatesFetchedAt(fetchedAt)
      })
      .catch(() => {
        if (!cancelled) setRatesFetchedAt(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, needsFx, txCurrency])

  useEffect(() => {
    if (!open) return
    setTeachPenda(false)
    if (transaction) {
      setType(transaction.type)
      setAmount(fromMinorUnits(transaction.amount_minor).toString())
      setTxCurrency(transaction.currency || currency)
      setCategoryId(transaction.category_id ?? '')
      setMerchant(transaction.merchant ?? '')
      setDescription(transaction.description ?? '')
      setDate(transaction.transaction_date)
      const extracted = transaction.ai_extraction?.items ?? []
      setLines(linesFromTransaction(transaction, categories))
      setReceiptMode(
        transaction.source === 'receipt' && !transaction.user_confirmed && extracted.length > 1
          ? 'items'
          : 'combined',
      )
    } else if (draft) {
      setType(draft.type)
      setAmount(fromMinorUnits(draft.amount_minor).toString())
      setTxCurrency(currency)
      setCategoryId('')
      setMerchant(draft.merchant ?? '')
      setDescription(draft.description ?? '')
      setDate(draft.transaction_date)
      setLines([])
      setReceiptMode('combined')
    } else {
      setType('expense')
      setAmount('')
      setTxCurrency(currency)
      setCategoryId('')
      setMerchant('')
      setDescription('')
      setDate(today())
      setLines([])
      setReceiptMode('combined')
    }
  }, [open, transaction, draft, categories, currency])

  const canTeach =
    !itemsMode &&
    !!walletId &&
    !!categoryId &&
    !!merchant.trim() &&
    (!transaction || transaction.category_id !== categoryId || (transaction.merchant ?? '') !== merchant.trim())

  const itemsTotalMinor = lines.reduce((sum, line) => {
    const n = Number(line.amount)
    return sum + (n > 0 ? toMinorUnits(n) : 0)
  }, 0)
  const receiptTotalMinor = transaction?.amount_minor ?? 0

  const ratesFreshness =
    needsFx && ratesFetchedAt
      ? Date.now() - new Date(ratesFetchedAt).getTime() > 48 * 60 * 60 * 1000
        ? ' Rates may be stale.'
        : ` Rates as of ${new Date(ratesFetchedAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}.`
      : ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (itemsMode) {
      const items = lines
        .map((line) => ({
          description: line.description.trim(),
          amount_minor: toMinorUnits(Number(line.amount) || 0),
          category_id: line.categoryId || null,
        }))
        .filter((line) => line.description && line.amount_minor > 0)
      if (items.length === 0) return

      await onConfirmItems!({
        type,
        currency: txCurrency,
        merchant: merchant || null,
        transaction_date: date,
        items,
      })
    } else {
      const amountNumber = Number(amount)
      if (!amountNumber || amountNumber <= 0) return

      await onSubmit({
        type,
        amount_minor: toMinorUnits(amountNumber),
        currency: txCurrency,
        category_id: categoryId || null,
        merchant: merchant || null,
        description: description || null,
        transaction_date: date,
        // Preserve provenance (e.g. 'sms') for a new draft; edits keep their row's source.
        ...(!transaction && draft?.source ? { source: draft.source } : {}),
      })
    }

    if (teachPenda && canTeach && walletId && categoryId) {
      try {
        await upsertCategorizationRule(walletId, {
          match_type: 'merchant_contains',
          match_value: merchant.trim(),
          category_id: categoryId,
        })
      } catch {
        // Rule save is best-effort, the transaction already landed.
      }
    }
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle>
            {isReceiptDraft
              ? 'Confirm receipt'
              : transaction
                ? 'Edit transaction'
                : draft
                  ? 'Confirm transaction'
                  : 'Add transaction'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 pb-6">
          {receiptImageUrl && (
            <img
              src={receiptImageUrl}
              alt="Receipt"
              className="max-h-48 w-full rounded-2xl border border-border/60 object-contain shadow-[var(--shadow-soft)]"
            />
          )}

          {canItemize && (
            <div className="flex flex-col gap-1.5">
              <Label>Log as</Label>
              <ToggleGroup
                type="single"
                value={receiptMode}
                onValueChange={(v) => v && setReceiptMode(v as ReceiptLogMode)}
                className="w-full"
              >
                <ToggleGroupItem value="combined" className="flex-1">
                  One total
                </ToggleGroupItem>
                <ToggleGroupItem value="items" className="flex-1">
                  Separate items
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">
                {itemsMode
                  ? 'Each line becomes its own expense in your ledger.'
                  : 'Keep everything as a single expense for this merchant.'}
              </p>
            </div>
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

          {itemsMode ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Items</Label>
                <span className="text-xs text-muted-foreground">
                  Sum {formatMoney(itemsTotalMinor, currency)}
                  {receiptTotalMinor > 0 && itemsTotalMinor !== receiptTotalMinor
                    ? ` · receipt ${formatMoney(receiptTotalMinor, currency)}`
                    : ''}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {lines.map((line, index) => (
                  <div
                    key={line.key}
                    className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-secondary/30 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="grid min-w-0 flex-1 grid-cols-[1fr_5.5rem] gap-2">
                        <Input
                          aria-label={`Item ${index + 1} name`}
                          value={line.description}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row) =>
                                row.key === line.key ? { ...row, description: e.target.value } : row,
                              ),
                            )
                          }
                          placeholder="Item"
                        />
                        <Input
                          aria-label={`Item ${index + 1} amount`}
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={line.amount}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row) =>
                                row.key === line.key ? { ...row, amount: e.target.value } : row,
                              ),
                            )
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 shrink-0"
                        disabled={lines.length <= 1}
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() => setLines((prev) => prev.filter((row) => row.key !== line.key))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <Select
                      value={line.categoryId}
                      onValueChange={(value) =>
                        setLines((prev) =>
                          prev.map((row) =>
                            row.key === line.key ? { ...row, categoryId: value } : row,
                          ),
                        )
                      }
                    >
                      <SelectTrigger
                        aria-label={`Item ${index + 1} category`}
                        className="w-full"
                      >
                        <SelectValue placeholder="Uncategorized" />
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
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    {
                      key: nextKey(),
                      description: '',
                      amount: '',
                      categoryId: categoryId || transaction?.category_id || '',
                    },
                  ])
                }
              >
                <Plus className="size-4" />
                Add item
              </Button>
            </div>
          ) : (
            <>
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
                <Label htmlFor="tx-currency">Currency</Label>
                <Select value={txCurrency} onValueChange={setTxCurrency}>
                  <SelectTrigger id="tx-currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code}, {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {needsFx ? (
                  <p className="text-xs text-muted-foreground">
                    Converted to wallet {currency} for balances and budgets.
                    {ratesFreshness}
                  </p>
                ) : null}
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
                        {category.icon ? `${category.icon} ` : ''}
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

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

          {!itemsMode && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Notes</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {canTeach && (
            <label className="flex items-start gap-2 rounded-2xl border border-[var(--iris)]/20 bg-[var(--iris-soft)]/60 px-3.5 py-2.5 text-sm shadow-[var(--shadow-soft)]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={teachPenda}
                onChange={(e) => setTeachPenda(e.target.checked)}
              />
              <span>
                Teach Penda, next time I see <span className="font-medium">{merchant.trim()}</span>, use this
                category
              </span>
            </label>
          )}

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
              {isReceiptDraft
                ? itemsMode
                  ? `Confirm ${lines.filter((l) => l.description.trim() && Number(l.amount) > 0).length} items`
                  : 'Confirm'
                : transaction
                  ? 'Save'
                  : draft
                    ? 'Confirm'
                    : 'Add'}
            </Button>
          </SheetFooter>

          {onOpenInApp && transaction && !isReceiptDraft && (
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
