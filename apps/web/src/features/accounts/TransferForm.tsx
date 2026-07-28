import { useEffect, useState } from 'react'
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toMinorUnits } from '@/lib/money'
import type { Account } from './types'

interface TransferFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: Account[]
  currency: string
  defaultFromId?: string | null
  onSubmit: (input: {
    fromAccountId: string
    toAccountId: string
    amountMinor: number
    date: string
    note: string | null
  }) => Promise<void>
  isSubmitting?: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

export function TransferForm({
  open,
  onOpenChange,
  accounts,
  currency,
  defaultFromId,
  onSubmit,
  isSubmitting,
}: TransferFormProps) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    const from = defaultFromId ?? accounts[0]?.id ?? ''
    const to = accounts.find((a) => a.id !== from)?.id ?? ''
    setFromId(from)
    setToId(to)
    setAmount('')
    setDate(today())
    setNote('')
  }, [open, accounts, defaultFromId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(amount)
    if (!fromId || !toId || !n || n <= 0) return
    await onSubmit({
      fromAccountId: fromId,
      toAccountId: toId,
      amountMinor: toMinorUnits(n),
      date,
      note: note.trim() || null,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="border-0 ring-0">
        <SheetHeader>
          <SheetTitle>Transfer between pockets</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label>From</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose pocket" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} disabled={a.id === toId}>
                    {a.icon ? `${a.icon} ` : ''}
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>To</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose pocket" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} disabled={a.id === fromId}>
                    {a.icon ? `${a.icon} ` : ''}
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-amount">Amount ({currency})</Label>
            <Input
              id="transfer-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-date">Date</Label>
            <Input
              id="transfer-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-note">Note (optional)</Label>
            <Input
              id="transfer-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Cash to Airtel"
            />
          </div>
          <SheetFooter>
            <Button
              type="submit"
              disabled={isSubmitting || !fromId || !toId || fromId === toId || !Number(amount)}
            >
              Transfer
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
