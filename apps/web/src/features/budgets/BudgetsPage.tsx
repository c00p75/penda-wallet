import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Clay3DIcon } from '@/components/Clay'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BottomNav } from '@/components/BottomNav'
import { AiInsight } from '@/components/AiInsight'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useCategories } from '@/features/categories/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { useBudgetProgress, useBudgets, useCreateBudget, useDeleteBudget, useUpdateBudget } from './hooks'
import { BudgetForm } from './BudgetForm'
import { BudgetProgressCard } from './BudgetProgressCard'
import { BudgetSuggestionsSheet } from './BudgetSuggestionsSheet'
import { suggestBudgets, type BudgetSuggestion } from './suggestBudgets'
import { SpendingPlanCard } from '@/features/planning/SpendingPlanCard'
import type { Budget, BudgetInput } from './types'
import {
  useCreateRecurringTransaction,
  useDeleteRecurringTransaction,
  useRecurringTransactions,
  useSetRecurringActive,
  useUpdateRecurringTransaction,
} from '@/features/recurring/hooks'
import { RecurringForm } from '@/features/recurring/RecurringForm'
import { RecurringList } from '@/features/recurring/RecurringList'
import type { RecurringInput, RecurringTransaction } from '@/features/recurring/types'

export function BudgetsPage() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()
  const { data: categories = [] } = useCategories(wallet?.id)

  const { data: budgets = [] } = useBudgets(wallet?.id)
  const { data: progress = [] } = useBudgetProgress(wallet?.id)
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const createBudget = useCreateBudget(wallet?.id)
  const updateBudget = useUpdateBudget(wallet?.id)
  const deleteBudget = useDeleteBudget(wallet?.id)

  const { data: recurring = [] } = useRecurringTransactions(wallet?.id)
  const createRecurring = useCreateRecurringTransaction(wallet?.id)
  const updateRecurring = useUpdateRecurringTransaction(wallet?.id)
  const setRecurringActive = useSetRecurringActive(wallet?.id)
  const deleteRecurring = useDeleteRecurringTransaction(wallet?.id)

  const [tab, setTab] = useState<'budgets' | 'recurring'>('budgets')
  const [budgetFormOpen, setBudgetFormOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [recurringFormOpen, setRecurringFormOpen] = useState(false)
  const [editingRecurring, setEditingRecurring] = useState<RecurringTransaction | null>(null)

  const suggestions = useMemo(
    () =>
      suggestBudgets(transactions, {
        existingCategoryIds: budgets.map((b) => b.category_id).filter((id): id is string => !!id),
      }),
    [transactions, budgets],
  )

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  async function handleBudgetSubmit(input: BudgetInput) {
    try {
      if (editingBudget) {
        await updateBudget.mutateAsync({ id: editingBudget.id, input })
        toast('Budget updated.')
      } else {
        await createBudget.mutateAsync(input)
        toast('Budget added.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleBudgetDelete() {
    if (!editingBudget) return
    try {
      await deleteBudget.mutateAsync(editingBudget.id)
      toast('Budget deleted.')
      setBudgetFormOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleCreateSuggested(selected: BudgetSuggestion[]) {
    try {
      for (const s of selected) {
        await createBudget.mutateAsync({
          category_id: s.categoryId,
          amount_minor: s.suggestedAmountMinor,
          period: 'monthly',
          rollover: false,
        })
      }
      setSuggestOpen(false)
      toast(`Created ${selected.length} budget${selected.length === 1 ? '' : 's'}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleRecurringSubmit(input: RecurringInput) {
    try {
      if (editingRecurring) {
        await updateRecurring.mutateAsync({ id: editingRecurring.id, input })
        toast('Recurring transaction updated.')
      } else {
        await createRecurring.mutateAsync(input)
        toast('Recurring transaction added.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleRecurringDelete() {
    if (!editingRecurring) return
    try {
      await deleteRecurring.mutateAsync(editingRecurring.id)
      toast('Recurring transaction deleted.')
      setRecurringFormOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  // AI speaks first: a real read of this page's own data, tab-aware.
  const insight: { tone: 'default' | 'warm' | 'attention'; text: string } | null =
    tab === 'budgets'
      ? progress.length === 0
        ? null
        : (() => {
            const worst = progress
              .map((p) => ({
                name: categories.find((c) => c.id === p.category_id)?.name ?? 'Overall',
                pct: p.amount_minor > 0 ? p.spent_minor / p.amount_minor : 0,
                remaining: p.amount_minor - p.spent_minor,
              }))
              .sort((a, b) => b.pct - a.pct)[0]
            if (worst.pct >= 1)
              return { tone: 'attention', text: `${worst.name} is over budget — want me to help you rebalance?` }
            if (worst.pct >= 0.8)
              return {
                tone: 'warm',
                text: `${worst.name} is running warm — ${formatMoney(worst.remaining, wallet.base_currency)} left.`,
              }
            return {
              tone: 'default',
              text: `You’re comfortable across all ${progress.length} budget${progress.length === 1 ? '' : 's'}. Nice work.`,
            }
          })()
      : recurring.length === 0
        ? null
        : {
            tone: 'default',
            text: `${recurring.length} recurring ${recurring.length === 1 ? 'transaction posts' : 'transactions post'} automatically — that’s ${recurring.length === 1 ? 'one bill' : 'that many bills'} you’ll never forget.`,
          }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4 pb-24">
      <header className="flex items-center gap-2.5">
        <Clay3DIcon name="piggybank" accent="#22a45d" size={30} />
        <h1 className="text-xl font-semibold">How am I doing?</h1>
      </header>

      {insight && <AiInsight tone={insight.tone}>{insight.text}</AiInsight>}

      <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as typeof tab)} className="w-full">
        <ToggleGroupItem value="budgets" className="flex-1">
          Budgets
        </ToggleGroupItem>
        <ToggleGroupItem value="recurring" className="flex-1">
          Recurring
        </ToggleGroupItem>
      </ToggleGroup>

      {tab === 'budgets' && (
        <SpendingPlanCard walletId={wallet.id} currency={wallet.base_currency} transactions={transactions} />
      )}

      {tab === 'budgets' && suggestions.length > 0 && (
        <Button
          variant="outline"
          onClick={() => setSuggestOpen(true)}
          className="justify-start gap-2 border-dashed"
        >
          <Sparkles className="size-4 text-primary" />
          Suggest {suggestions.length} budget{suggestions.length === 1 ? '' : 's'} from your spending
        </Button>
      )}

      {tab === 'budgets' ? (
        budgets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <Clay3DIcon name="piggybank" accent="#22a45d" size={64} />
            <div className="flex flex-col gap-1">
              <p className="font-medium">No budgets yet</p>
              <p className="text-sm">Tap + to set a weekly or monthly spending limit.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {progress.map((p) => (
              <BudgetProgressCard
                key={p.budget_id}
                progress={p}
                category={categories.find((c) => c.id === p.category_id) ?? null}
                currency={wallet.base_currency}
                onSelect={() => {
                  const budget = budgets.find((b) => b.id === p.budget_id)
                  if (budget) {
                    setEditingBudget(budget)
                    setBudgetFormOpen(true)
                  }
                }}
              />
            ))}
          </div>
        )
      ) : (
        <RecurringList
          recurring={recurring}
          categories={categories}
          onSelect={(rule) => {
            setEditingRecurring(rule)
            setRecurringFormOpen(true)
          }}
          onToggleActive={(rule, isActive) => setRecurringActive.mutate({ id: rule.id, isActive })}
        />
      )}

      <Button
        onClick={() => {
          if (tab === 'budgets') {
            setEditingBudget(null)
            setBudgetFormOpen(true)
          } else {
            setEditingRecurring(null)
            setRecurringFormOpen(true)
          }
        }}
        size="icon"
        className="fixed bottom-20 right-6 h-14 w-14 rounded-full shadow-lg"
        aria-label={tab === 'budgets' ? 'Add budget' : 'Add recurring transaction'}
      >
        <Plus className="size-6" />
      </Button>

      <BudgetForm
        open={budgetFormOpen}
        onOpenChange={setBudgetFormOpen}
        categories={categories}
        currency={wallet.base_currency}
        budget={editingBudget}
        onSubmit={handleBudgetSubmit}
        onDelete={editingBudget ? handleBudgetDelete : undefined}
        isSubmitting={createBudget.isPending || updateBudget.isPending}
      />

      <BudgetSuggestionsSheet
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        suggestions={suggestions}
        currency={wallet.base_currency}
        onCreate={handleCreateSuggested}
        isCreating={createBudget.isPending}
      />

      <RecurringForm
        open={recurringFormOpen}
        onOpenChange={setRecurringFormOpen}
        categories={categories}
        currency={wallet.base_currency}
        recurring={editingRecurring}
        onSubmit={handleRecurringSubmit}
        onDelete={editingRecurring ? handleRecurringDelete : undefined}
        isSubmitting={createRecurring.isPending || updateRecurring.isPending}
      />

      <BottomNav />
    </main>
  )
}
