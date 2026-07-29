import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cardAccentClass } from '@/components/ui/cardAccent'
import { formatMoney, fromMinorUnits } from '@/lib/money'
import { SquaresFour, Target, MagicWand, PiggyBank, type Icon } from '@/components/icons/product'
import type { Category } from '@/features/categories/types'
import type { Transaction } from '@/features/transactions/types'
import type { SavingsGoal } from '@/features/goals/types'
import {
  needsWantsSavingsStrategy,
  zeroBasedStrategy,
  payYourselfFirstStrategy,
  type BudgetStrategyId,
  type StrategyResult,
} from './strategies'

interface BudgetStrategiesSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planAmountMinor: number
  currency: string
  monthLabel: string
  categories: Category[]
  transactions: Transaction[]
  goals: SavingsGoal[]
  existingCategoryIds: string[]
  hasOverallBudget: boolean
  payYourselfFirstPct: number
  onPreview: (result: StrategyResult, meta: { title: string; description: string }) => void
  onTalk: (prompt: string) => void
}

const STRATEGY_META: Record<BudgetStrategyId, { title: string; blurb: string; icon: Icon }> = {
  fifty_thirty_twenty: { title: '50/30/20 rule', blurb: '50% needs, 30% wants, 20% savings', icon: SquaresFour },
  needs_wants_savings: { title: 'Needs, wants, savings', blurb: 'Same idea, your own ratio', icon: Target },
  zero_based: { title: 'Zero-based budgeting', blurb: 'Every bit of the plan gets a job, nothing left over', icon: MagicWand },
  pay_yourself_first: { title: 'Pay yourself first', blurb: 'Save off the top, spend the rest freely', icon: PiggyBank },
}

const STRATEGY_ORDER: BudgetStrategyId[] = [
  'fifty_thirty_twenty',
  'needs_wants_savings',
  'zero_based',
  'pay_yourself_first',
]

function strategyTalkPrompt(id: BudgetStrategyId, amountMinor: number, currency: string, monthLabel: string): string {
  const amount = fromMinorUnits(amountMinor).toLocaleString()
  switch (id) {
    case 'fifty_thirty_twenty':
      return `I want to try the 50/30/20 rule for my ${monthLabel} plan of ${currency} ${amount}. Split it roughly 50% needs, 30% wants, 20% savings across my categories, look at how I actually spend, and only ask me what you can't work out yourself. Keep it short.`
    case 'needs_wants_savings':
      return `I want to split my ${monthLabel} plan of ${currency} ${amount} into needs, wants, and savings, but with my own ratio instead of the standard 50/30/20. Ask me what ratio I want, then split it across my categories and only ask what you can't work out yourself. Keep it short.`
    case 'zero_based':
      return `I want to try zero-based budgeting for my ${monthLabel} plan of ${currency} ${amount}, so every category and my savings goals get a job and nothing is left unassigned. Look at how I actually spend, propose amounts that add up to the full plan, and only ask what you can't work out yourself. Keep it short.`
    case 'pay_yourself_first':
      return `I want to try pay yourself first for my ${monthLabel} plan of ${currency} ${amount}. Set aside a savings percentage off the top before anything else, then let me spend the rest freely without splitting it into more categories. Suggest a percentage based on my goals if I haven't set one, and only ask what you can't work out yourself. Keep it short.`
  }
}

/**
 * Named budgeting-strategy templates, each with a one-tap preview (computed
 * client-side, reviewed before anything is saved) and a chat hand-off for
 * anyone who'd rather talk it through with Penda.
 */
export function BudgetStrategiesSheet({
  open,
  onOpenChange,
  planAmountMinor,
  currency,
  monthLabel,
  categories,
  transactions,
  goals,
  existingCategoryIds,
  hasOverallBudget,
  payYourselfFirstPct,
  onPreview,
  onTalk,
}: BudgetStrategiesSheetProps) {
  const [customizingRatio, setCustomizingRatio] = useState(false)
  const [needsPct, setNeedsPct] = useState('50')
  const [wantsPct, setWantsPct] = useState('30')
  const [savingsPct, setSavingsPct] = useState('20')

  const ratioTotal = (Number(needsPct) || 0) + (Number(wantsPct) || 0) + (Number(savingsPct) || 0)
  const ratioValid = ratioTotal === 100

  function reset() {
    setCustomizingRatio(false)
    setNeedsPct('50')
    setWantsPct('30')
    setSavingsPct('20')
  }

  function preview(id: BudgetStrategyId) {
    let result: StrategyResult
    if (id === 'fifty_thirty_twenty') {
      result = needsWantsSavingsStrategy(planAmountMinor, categories, existingCategoryIds)
    } else if (id === 'needs_wants_savings') {
      if (!ratioValid) return
      result = needsWantsSavingsStrategy(planAmountMinor, categories, existingCategoryIds, {
        needs: (Number(needsPct) || 0) / 100,
        wants: (Number(wantsPct) || 0) / 100,
        savings: (Number(savingsPct) || 0) / 100,
      })
    } else if (id === 'zero_based') {
      result = zeroBasedStrategy(planAmountMinor, categories, transactions, goals, existingCategoryIds)
    } else {
      result = payYourselfFirstStrategy(planAmountMinor, goals, payYourselfFirstPct, hasOverallBudget)
    }

    const meta = STRATEGY_META[id]
    const description =
      result.savingsReserveMinor > 0
        ? `${meta.blurb}. About ${formatMoney(result.savingsReserveMinor, currency)}/mo toward savings, not created as an envelope here, check it against your goals.`
        : meta.blurb
    onPreview(result, { title: meta.title, description })
    onOpenChange(false)
    reset()
  }

  function talk(id: BudgetStrategyId) {
    onTalk(strategyTalkPrompt(id, planAmountMinor, currency, monthLabel))
    onOpenChange(false)
    reset()
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
        <SheetHeader>
          <SheetTitle>Budgeting strategies</SheetTitle>
          <SheetDescription>Pick a way to split your {monthLabel} plan. Preview it or talk it through with Penda.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4 pb-4">
          {STRATEGY_ORDER.map((id) => {
            const meta = STRATEGY_META[id]
            const Icon = meta.icon
            const isRatioCard = id === 'needs_wants_savings'

            return (
              <div
                key={id}
                className={cardAccentClass('iris', 'flex flex-col gap-3 rounded-[1.5rem] bg-card p-4')}
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--iris-soft)] text-[var(--iris)]">
                    <Icon className="size-5" weight="duotone" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{meta.title}</p>
                    <p className="text-sm text-muted-foreground">{meta.blurb}</p>
                  </div>
                </div>

                {isRatioCard && customizingRatio && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <div className="flex flex-1 flex-col gap-1">
                        <Label htmlFor="ratio-needs" className="text-xs">Needs %</Label>
                        <Input id="ratio-needs" type="number" inputMode="numeric" min="0" max="100" value={needsPct} onChange={(e) => setNeedsPct(e.target.value)} />
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <Label htmlFor="ratio-wants" className="text-xs">Wants %</Label>
                        <Input id="ratio-wants" type="number" inputMode="numeric" min="0" max="100" value={wantsPct} onChange={(e) => setWantsPct(e.target.value)} />
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <Label htmlFor="ratio-savings" className="text-xs">Savings %</Label>
                        <Input id="ratio-savings" type="number" inputMode="numeric" min="0" max="100" value={savingsPct} onChange={(e) => setSavingsPct(e.target.value)} />
                      </div>
                    </div>
                    {!ratioValid && (
                      <p className="text-xs text-destructive">Needs, wants, and savings must add up to 100%.</p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => talk(id)}
                  >
                    <MessageCircle className="size-4" />
                    Talk it through
                  </Button>
                  {isRatioCard && !customizingRatio ? (
                    <Button type="button" size="sm" className="flex-1" onClick={() => setCustomizingRatio(true)}>
                      Set my ratio
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1"
                      disabled={isRatioCard && !ratioValid}
                      onClick={() => preview(id)}
                    >
                      Preview split
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
