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
import type { CommitmentPactInput } from './types'

interface PactFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
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

/** Penda holds you to it (roadmap bet #2) — a pact is a category to avoid over a window. */
export function PactForm({ open, onOpenChange, categories, onSubmit, isSubmitting }: PactFormProps) {
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    if (!open) return
    setDescription('')
    setCategoryId('')
    setEndDate(weekFromNowStr())
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim() || !categoryId || !endDate) return
    await onSubmit({
      description: description.trim(),
      category_id: categoryId,
      start_date: todayStr(),
      end_date: endDate,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
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
