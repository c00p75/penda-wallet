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
import { EmojiPicker } from '@/components/EmojiPicker'
import type { SavingsGoal, SavingsGoalInput } from './types'
import { fromMinorUnits, toMinorUnits } from '@/lib/money'

const ICON_CHOICES = [
  '🏖️', '✈️', '🚗', '🏠', '🎓', '💍', '👶', '🎉',
  '💻', '📱', '🛡️', '💰', '🎁', '🏥', '🐾', '🚴',
]

interface GoalFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currency: string
  goal?: SavingsGoal | null
  onSubmit: (input: SavingsGoalInput, initialAmountMinor: number) => Promise<void>
  onDelete?: () => Promise<void>
  isSubmitting?: boolean
}

export function GoalForm({ open, onOpenChange, currency, goal, onSubmit, onDelete, isSubmitting }: GoalFormProps) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [targetAmount, setTargetAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [alreadySaved, setAlreadySaved] = useState('')

  useEffect(() => {
    if (!open) return
    if (goal) {
      setName(goal.name)
      setIcon(goal.icon)
      setTargetAmount(fromMinorUnits(goal.target_amount_minor).toString())
      setTargetDate(goal.target_date ?? '')
      setAlreadySaved('')
    } else {
      setName('')
      setIcon(null)
      setTargetAmount('')
      setTargetDate('')
      setAlreadySaved('')
    }
  }, [open, goal])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const targetNumber = Number(targetAmount)
    if (!name.trim() || !targetNumber || targetNumber <= 0) return

    await onSubmit(
      {
        name: name.trim(),
        icon,
        target_amount_minor: toMinorUnits(targetNumber),
        target_date: targetDate || null,
      },
      toMinorUnits(Number(alreadySaved) || 0),
    )
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{goal ? 'Edit savings goal' : 'New savings goal'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-name">Name</Label>
            <Input
              id="goal-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Emergency fund"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Icon</Label>
            <EmojiPicker emojis={ICON_CHOICES} value={icon} onChange={setIcon} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-target">Target amount</Label>
            <Input
              id="goal-target"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {!goal && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-already-saved">Already saved (optional)</Label>
              <Input
                id="goal-already-saved"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={alreadySaved}
                onChange={(e) => setAlreadySaved(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-date">Target date (optional)</Label>
            <Input
              id="goal-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          <p className="text-xs text-muted-foreground">Amounts are in {currency}.</p>

          <SheetFooter className="flex-row gap-2 px-0">
            {goal && onDelete && (
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
              {goal ? 'Save' : 'Add'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
