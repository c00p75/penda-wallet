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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Category } from '@/features/categories/types'
import { toMinorUnits } from '@/lib/money'
import type { CommitmentPactInput, PactStakeKind } from './types'

interface PactFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  goalId?: string | null
  goalName?: string
  onSubmit: (input: CommitmentPactInput) => Promise<void>
  isSubmitting?: boolean
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function weekFromNowStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

/** Penda holds you to it (roadmap bet #2), a pact is a category to avoid over a window. */
export function PactForm({ open, onOpenChange, categories, goalId, goalName, onSubmit, isSubmitting }: PactFormProps) {
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [endDate, setEndDate] = useState('')
  const [stakeKind, setStakeKind] = useState<PactStakeKind>('none')
  const [stakeAmount, setStakeAmount] = useState('')
  const [stakeNote, setStakeNote] = useState('')

  useEffect(() => {
    if (!open) return
    setDescription('')
    setCategoryId('')
    setEndDate(weekFromNowStr())
    setStakeKind('none')
    setStakeAmount('')
    setStakeNote('')
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim() || !categoryId || !endDate) return
    const amountMinor =
      stakeKind !== 'none' && Number(stakeAmount) > 0 ? toMinorUnits(Number(stakeAmount)) : null
    await onSubmit({
      description: description.trim(),
      category_id: categoryId,
      goal_id: goalId ?? null,
      start_date: todayStr(),
      end_date: endDate,
      stake_kind: stakeKind === 'none' ? 'none' : stakeKind,
      stake_amount_minor: amountMinor,
      stake_note: stakeNote.trim() || null,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle>New pact</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pact-description">What are you committing to?</Label>
            <Input
              id="pact-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="No takeout this week"
              required
            />
            {goalName && (
              <p className="text-xs text-muted-foreground">In service of your {goalName} goal.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pact-category">Category to avoid</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="pact-category" className="w-full">
                <SelectValue placeholder="Choose a category" />
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
            <p className="text-xs text-muted-foreground">
              Any spending logged in this category before the end date breaks the pact.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pact-end-date">Until</Label>
            <Input
              id="pact-end-date"
              type="date"
              min={todayStr()}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pact-stake">Stakes (optional)</Label>
            <Select value={stakeKind} onValueChange={(v) => setStakeKind(v as PactStakeKind)}>
              <SelectTrigger id="pact-stake" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No stakes</SelectItem>
                <SelectItem value="charity">Charity pledge if I break it</SelectItem>
                <SelectItem value="friend">Tell a friend / accountability</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Honor system — Penda won’t move money; it just holds you to the pledge.
            </p>
          </div>
          {stakeKind !== 'none' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pact-stake-amt">Stake amount</Label>
                <Input
                  id="pact-stake-amt"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pact-stake-note">Who / which cause?</Label>
                <Input
                  id="pact-stake-note"
                  value={stakeNote}
                  onChange={(e) => setStakeNote(e.target.value)}
                  placeholder={stakeKind === 'charity' ? 'Local food bank' : 'Text Ama if I slip'}
                />
              </div>
            </>
          ) : null}

          <SheetFooter className="flex-row gap-2 px-0">
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" disabled={isSubmitting || !categoryId} className="flex-1">
              Commit
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
