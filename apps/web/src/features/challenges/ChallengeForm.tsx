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
import type { ChallengeInput, ChallengeType } from './types'
import { toMinorUnits } from '@/lib/money'

interface ChallengeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currency: string
  walletId: string
  onSubmit: (input: ChallengeInput) => Promise<void>
  isSubmitting?: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

function plusDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function ChallengeForm({
  open,
  onOpenChange,
  currency,
  walletId,
  onSubmit,
  isSubmitting,
}: ChallengeFormProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<ChallengeType>('savings_target')
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState('7')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState(plusDays(30))

  useEffect(() => {
    if (!open) return
    setName('')
    setType('savings_target')
    setAmount('')
    setDays('7')
    setStartDate(today())
    setEndDate(plusDays(30))
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    const target_metric =
      type === 'no_spend_streak'
        ? { days: Number(days) || 7 }
        : { amount_minor: toMinorUnits(Number(amount) || 0), currency }

    if (type !== 'no_spend_streak' && (!Number(amount) || Number(amount) <= 0)) return

    await onSubmit({
      name: name.trim(),
      type,
      target_metric,
      start_date: startDate,
      end_date: endDate,
      wallet_id: walletId,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New challenge</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="challenge-name">Name</Label>
            <Input
              id="challenge-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="July savings sprint"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <ToggleGroup
              type="single"
              value={type}
              onValueChange={(v) => v && setType(v as ChallengeType)}
              className="w-full"
            >
              <ToggleGroupItem value="savings_target" className="flex-1 text-xs">
                Save the most
              </ToggleGroupItem>
              <ToggleGroupItem value="spending_limit" className="flex-1 text-xs">
                Spend the least
              </ToggleGroupItem>
              <ToggleGroupItem value="no_spend_streak" className="flex-1 text-xs">
                No-spend streak
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {type === 'no_spend_streak' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="challenge-days">Streak goal (days)</Label>
              <Input
                id="challenge-days"
                type="number"
                inputMode="numeric"
                min="1"
                required
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="challenge-amount">
                {type === 'savings_target' ? 'Savings goal' : 'Spending limit'} ({currency})
              </Label>
              <Input
                id="challenge-amount"
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
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="challenge-start">Starts</Label>
              <Input
                id="challenge-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="challenge-end">Ends</Label>
              <Input
                id="challenge-end"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <SheetFooter className="flex-row gap-2 px-0">
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              Create
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
