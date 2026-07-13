import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BottomNav } from '@/components/BottomNav'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useCategories } from '@/features/categories/hooks'
import { useBudgetProgress, useBudgets, useCreateBudget, useDeleteBudget, useUpdateBudget } from './hooks'
import { BudgetForm } from './BudgetForm'
import { BudgetProgressCard } from './BudgetProgressCard'
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
  const [recurringFormOpen, setRecurringFormOpen] = useState(false)
  const [editingRecurring, setEditingRecurring] = useState<RecurringTransaction | null>(null)

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

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4 pb-24">
      <header>
        <h1 className="text-xl font-semibold">Budgets</h1>
      </header>

      <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as typeof tab)} className="w-full">
        <ToggleGroupItem value="budgets" className="flex-1">
          Budgets
        </ToggleGroupItem>
        <ToggleGroupItem value="recurring" className="flex-1">
          Recurring
        </ToggleGroupItem>
      </ToggleGroup>

      {tab === 'budgets' ? (
        budgets.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-16 text-center text-muted-foreground">
            <p className="font-medium">No budgets yet</p>
            <p className="text-sm">Tap + to set a weekly or monthly spending limit.</p>
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
    </div>
  )
}
