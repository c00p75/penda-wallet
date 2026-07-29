import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export interface HomeCardLayoutItem {
  id: string
  label: string
  icon: string
  /** Custom override, or null to use `defaultColor`. */
  color: string | null
  defaultColor: string
}

interface HomeCardLayoutSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: HomeCardLayoutItem[]
  onReorder: (orderedIds: string[]) => void
  onColorChange: (id: string, color: string | null) => void
}

/** Bottom sheet for reordering the home carousel and customizing each card's color. */
export function HomeCardLayoutSheet({
  open,
  onOpenChange,
  items,
  onReorder,
  onColorChange,
}: HomeCardLayoutSheetProps) {
  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const tmp = next[index]!
    next[index] = next[target]!
    next[target] = tmp
    onReorder(next.map((item) => item.id))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle>Customize cards</SheetTitle>
          <SheetDescription>Reorder and recolor the cards on your home screen.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-4">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 shadow-[var(--shadow-soft)]"
            >
              <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-full">
                <input
                  type="color"
                  value={item.color ?? item.defaultColor}
                  onChange={(e) => onColorChange(item.id, e.target.value)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  aria-label={`Color for ${item.label}`}
                />
                <span
                  aria-hidden
                  className="pointer-events-none block size-full rounded-full"
                  style={{ background: item.color ?? item.defaultColor }}
                />
              </label>

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span aria-hidden className="shrink-0">
                  {item.icon}
                </span>
                <span className="truncate text-sm font-medium">{item.label}</span>
              </div>

              {item.color && (
                <button
                  type="button"
                  onClick={() => onColorChange(item.id, null)}
                  aria-label={`Reset ${item.label} color`}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-4" />
                </button>
              )}

              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${item.label} up`}
                  className={cn(
                    'text-muted-foreground hover:text-foreground',
                    index === 0 && 'opacity-30',
                  )}
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Move ${item.label} down`}
                  className={cn(
                    'text-muted-foreground hover:text-foreground',
                    index === items.length - 1 && 'opacity-30',
                  )}
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
