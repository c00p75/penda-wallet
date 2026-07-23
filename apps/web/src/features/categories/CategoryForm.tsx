import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmojiPicker, type EmojiGroup } from '@/components/EmojiPicker'
import { cn } from '@/lib/utils'
import type { Category, CategoryInput } from './types'

// Same Tailwind-500 hex set the seeded default categories already use, plus a
// few unused hues, so a custom category's color sits in the same family
// instead of introducing a visibly different palette.
const COLOR_SWATCHES: (string | null)[] = [
  null,
  '#ec4899', // pink (Entertainment)
  '#f97316', // orange (Food & Drinks)
  '#ef4444', // red (Health)
  '#14b8a6', // teal (Housing)
  '#22c55e', // green (Income)
  '#a855f7', // purple (Shopping)
  '#3b82f6', // blue (Transportation)
  '#eab308', // yellow (Utilities)
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#6366f1', // indigo
  '#d946ef', // fuchsia
]

// A broad, grouped set so almost any category has a fitting icon without
// forcing the user to hunt in the system emoji keyboard (still available via
// the free-text fallback in EmojiPicker).
const ICON_GROUPS: EmojiGroup[] = [
  {
    label: 'Food & drink',
    emojis: ['🍔', '🍕', '🍜', '🍱', '🥗', '🍿', '🍺', '🍷', '☕', '🧋', '🍰', '🛒', '🥦', '🍦'],
  },
  {
    label: 'Transport',
    emojis: ['🚗', '⛽', '🚕', '🚌', '🚆', '✈️', '🚲', '🛵', '🚢', '🅿️', '🛺', '🚧'],
  },
  {
    label: 'Home & bills',
    emojis: ['🏠', '💡', '💧', '🔥', '🪑', '🧹', '🧺', '🔧', '📶', '📺', '🗑️', '🏢'],
  },
  {
    label: 'Shopping',
    emojis: ['🛍️', '👕', '👟', '👗', '💄', '👜', '⌚', '💍', '🧸', '🎀', '🕶️'],
  },
  {
    label: 'Health & personal',
    emojis: ['💊', '🏥', '🩺', '💪', '🧘', '💇', '💆', '🦷', '👓', '🧴', '🩹'],
  },
  {
    label: 'Fun & leisure',
    emojis: ['🎬', '🎮', '🎵', '🎨', '⚽', '🎳', '🎤', '🎟️', '🏖️', '🎧', '📷', '🎲'],
  },
  {
    label: 'Money & work',
    emojis: ['💰', '💵', '💳', '🏦', '📈', '💼', '🧾', '🔄', '🎁', '🪙', '📊', '🤝'],
  },
  {
    label: 'Family & education',
    emojis: ['👶', '🐾', '🎓', '📚', '✏️', '🏫', '👪', '💒', '🎒', '🍼', '🧑‍🏫'],
  },
  {
    label: 'Tech & misc',
    emojis: ['📱', '💻', '🖨️', '🔌', '🛡️', '📦', '🌍', '⛪', '📝', '🎯', '⭐', '❓'],
  },
]

interface CategoryFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category | null
  onSubmit: (input: CategoryInput) => Promise<void>
  onDelete?: () => Promise<void>
  isSubmitting?: boolean
}

export function CategoryForm({ open, onOpenChange, category, onSubmit, onDelete, isSubmitting }: CategoryFormProps) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(category?.name ?? '')
    setIcon(category?.icon ?? null)
    setColor(category?.color ?? null)
  }, [open, category])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await onSubmit({ name: name.trim(), icon, color })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle>{category ? 'Edit category' : 'New category'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pets"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Icon</Label>
            <EmojiPicker groups={ICON_GROUPS} value={icon} onChange={setIcon} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2 rounded-2xl border border-border/60 bg-secondary/30 p-3 shadow-[var(--shadow-soft)]">
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch ?? 'none'}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={swatch ?? 'No color'}
                  aria-pressed={color === swatch}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-full border-2',
                    color === swatch ? 'border-foreground' : 'border-transparent',
                  )}
                  style={{ backgroundColor: swatch ?? 'var(--muted-foreground)' }}
                >
                  {color === swatch && <Check className="size-4" style={{ color: 'var(--background)' }} />}
                </button>
              ))}
            </div>
          </div>

          <SheetFooter className="flex-row gap-2 px-0">
            {category && onDelete && (
              <Button type="button" variant="destructive" onClick={() => setConfirmOpen(true)} className="flex-1">
                Delete
              </Button>
            )}
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                Cancel
              </Button>
            </SheetClose>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {category ? 'Save' : 'Add'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>

      {onDelete && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Delete "${category?.name}"?`}
          description="This also removes any budgets and auto-categorize rules set for it. Transactions using it become Uncategorized instead of being deleted."
          confirmLabel="Delete"
          isPending={isSubmitting}
          onConfirm={() => {
            setConfirmOpen(false)
            void onDelete()
          }}
        />
      )}
    </Sheet>
  )
}
