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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { FinancialMissionInput } from './types'

interface MissionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: FinancialMissionInput) => Promise<void>
  isSubmitting?: boolean
}

const today = () => new Date().toISOString().slice(0, 10)

function plusDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function MissionForm({ open, onOpenChange, onSubmit, isSubmitting }: MissionFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState(plusDays(7))

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDescription('')
    setStartDate(today())
    setEndDate(plusDays(7))
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return

    await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      start_date: startDate,
      end_date: endDate,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New mission</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mission-title">Title</Label>
            <Input
              id="mission-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Five no-spend days"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mission-description">Description (optional)</Label>
            <Textarea
              id="mission-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does keeping this mission look like?"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mission-start">Starts</Label>
              <Input
                id="mission-start"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mission-end">Ends</Label>
              <Input
                id="mission-end"
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
