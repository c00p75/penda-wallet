import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Sparkle } from '@/components/icons/product'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import type { BudgetSuggestion } from './suggestBudgets'

interface BudgetSuggestionsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  suggestions: BudgetSuggestion[]
  currency: string
  onCreate: (selected: BudgetSuggestion[]) => Promise<void>
  isCreating?: boolean
}

/**
 * Presents budgets Penda derived from recent spending. Everything starts
 * selected — the user deselects what they don't want and confirms in one tap.
 */
export function BudgetSuggestionsSheet({
  open,
  onOpenChange,
  suggestions,
  currency,
  onCreate,
  isCreating,
}: BudgetSuggestionsSheetProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) setSelected(new Set(suggestions.map((s) => s.categoryId)))
  }, [open, suggestions])

  const chosen = suggestions.filter((s) => selected.has(s.categoryId))
  const total = chosen.reduce((sum, s) => sum + s.suggestedAmountMinor, 0)
  const isStarter = suggestions.length > 0 && suggestions.every((s) => s.source === 'persona')

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkle className="size-5 text-primary" weight="duotone" />
            {isStarter ? 'A starting point' : 'Budgets from your spending'}
          </SheetTitle>
          <SheetDescription>
            {isStarter
              ? "No spending history yet, so here's a sensible starting split for your plan — tweak any later."
              : 'Based on your last few months. I rounded each one just above what you usually spend — tweak any later.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 px-4 pb-4">
          {suggestions.map((s) => {
            const isSelected = selected.has(s.categoryId)
            return (
              <button
                key={s.categoryId}
                type="button"
                onClick={() => toggle(s.categoryId)}
                aria-pressed={isSelected}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3.5 text-left shadow-[var(--shadow-soft)] ring-1 ring-border/50',
                  isSelected
                    ? 'border-primary/40 bg-[var(--iris-soft)]/60'
                    : 'border-border/60 opacity-60',
                )}
              >
                <span className="text-xl" aria-hidden>
                  {s.categoryIcon ?? '📊'}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{s.categoryName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {s.source === 'persona'
                      ? 'Suggested starting point'
                      : `You average ${formatMoney(s.monthlyAverageMinor, currency)}/mo`}
                  </span>
                </span>
                <span className="text-sm font-semibold">
                  {formatMoney(s.suggestedAmountMinor, currency)}
                </span>
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full border',
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                  )}
                >
                  {isSelected && <Check className="size-4" />}
                </span>
              </button>
            )
          })}

          <Button
            type="button"
            onClick={() => onCreate(chosen)}
            disabled={chosen.length === 0 || isCreating}
            className="mt-2 w-full"
          >
            {chosen.length === 0
              ? 'Select at least one'
              : `Create ${chosen.length} budget${chosen.length === 1 ? '' : 's'} · ${formatMoney(total, currency)}/mo`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
