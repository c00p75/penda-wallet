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
import type { Debt, DebtDirection, DebtInput } from './types'
import { fromMinorUnits, toMinorUnits } from '@/lib/money'

interface DebtFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currency: string
  debt?: Debt | null
  onSubmit: (input: DebtInput) => Promise<void>
  onDelete?: () => Promise<void>
  isSubmitting?: boolean
}

export function DebtForm({ open, onOpenChange, currency, debt, onSubmit, onDelete, isSubmitting }: DebtFormProps) {
  const [name, setName] = useState('')
  const [direction, setDirection] = useState<DebtDirection>('i_owe')
  const [counterparty, setCounterparty] = useState('')
  const [principal, setPrincipal] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [dueDate, setDueDate] = useState('')

  useEffect(() => {
    if (!open) return
    if (debt) {
      setName(debt.name)
      setDirection(debt.direction)
      setCounterparty(debt.counterparty ?? '')
      setPrincipal(fromMinorUnits(debt.principal_minor).toString())
      setInterestRate(debt.interest_rate?.toString() ?? '')
      setDueDate(debt.due_date ?? '')
    } else {
      setName('')
      setDirection('i_owe')
      setCounterparty('')
      setPrincipal('')
      setInterestRate('')
      setDueDate('')
    }
  }, [open, debt])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const principalNumber = Number(principal)
    if (!name.trim() || !principalNumber || principalNumber <= 0) return

    await onSubmit({
      name: name.trim(),
      direction,
      counterparty: counterparty || null,
      principal_minor: toMinorUnits(principalNumber),
      interest_rate: interestRate ? Number(interestRate) : null,
      due_date: dueDate || null,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle>{debt ? 'Edit debt' : 'New debt'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <ToggleGroup
            type="single"
            value={direction}
            onValueChange={(v) => v && setDirection(v as DebtDirection)}
            className="w-full"
          >
            <ToggleGroupItem value="i_owe" className="flex-1">
              I owe
            </ToggleGroupItem>
            <ToggleGroupItem value="owed_to_me" className="flex-1">
              Owed to me
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debt-name">Name</Label>
            <Input
              id="debt-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Car loan"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debt-counterparty">
              {direction === 'i_owe' ? 'Owed to' : 'Owed by'} (optional)
            </Label>
            <Input
              id="debt-counterparty"
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="Name or institution"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debt-principal">
              {debt ? 'Principal (original amount)' : 'Amount'}
            </Label>
            <Input
              id="debt-principal"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debt-rate">Interest rate % (optional)</Label>
            <Input
              id="debt-rate"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              placeholder="0.0"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debt-due-date">Due date (optional)</Label>
            <Input id="debt-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <p className="text-xs text-muted-foreground">Amounts are in {currency}.</p>

          <SheetFooter className="flex-row gap-2 px-0">
            {debt && onDelete && (
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
              {debt ? 'Save' : 'Add'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
