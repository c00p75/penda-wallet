import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useCategories } from '@/features/categories/hooks'
import { useBudgets } from '@/features/budgets/hooks'
import { useSavingsGoals } from '@/features/goals/hooks'
import {
  useCreateTransaction,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from '@/features/transactions/hooks'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import { TransactionList } from '@/features/transactions/TransactionList'
import type { Transaction, TransactionInput } from '@/features/transactions/types'
import { detectCoachingInsights } from '@/features/coaching/detectCoachingInsights'
import type { CoachingAction, CoachingInsight } from '@/features/coaching/detectCoachingInsights'
import { ReconcilePrompt } from '@/features/reconciliation/ReconcilePrompt'
import { useLatestReconciliation } from '@/features/reconciliation/hooks'
import { shouldPromptReconciliation } from '@/features/reconciliation/reconcile'
import { cn } from '@/lib/utils'

function AiInsightActionCard({
  insight,
  onAction,
  onDismiss,
}: {
  insight: CoachingInsight
  onAction: (action: CoachingAction) => void
  onDismiss: () => void
}) {
  return (
    <div
      className="relative rounded-2xl border-2 p-4"
      style={{ borderColor: 'var(--iris)', background: 'color-mix(in srgb, var(--iris) 8%, var(--card))' }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss insight"
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--iris)' }}>
        <Sparkles className="size-3.5" />
        AI Insight
      </div>
      <p className="pr-6 text-sm leading-snug">{insight.text}</p>
      {insight.action && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => {
              onAction(insight.action!)
              onDismiss()
            }}
          >
            {insight.action.label}
          </Button>
          <Button size="sm" variant="secondary" className="rounded-full" onClick={onDismiss}>
            Ignore
          </Button>
        </div>
      )}
    </div>
  )
}

export function LedgerPage() {
  const session = useAuthStore((s) => s.session)
  const navigate = useNavigate()
  const { data: wallet } = useCurrentWallet()
  const { data: categories = [] } = useCategories(wallet?.id)
  const { data: transactions = [], isLoading: isTransactionsLoading } = useTransactions(wallet?.id)
  const { data: budgets = [] } = useBudgets(wallet?.id)
  const { data: goals = [] } = useSavingsGoals(wallet?.id)

  const createTransaction = useCreateTransaction(wallet?.id)
  const updateTransaction = useUpdateTransaction(wallet?.id)
  const deleteTransaction = useDeleteTransaction(wallet?.id)

  const { data: latestReconciliation } = useLatestReconciliation(wallet?.id, session?.user.id)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [dismissedInsightIds, setDismissedInsightIds] = useState<Set<string>>(new Set())

  function openAddForm() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEditForm(tx: Transaction) {
    setEditing(tx)
    setFormOpen(true)
  }

  async function handleSubmit(input: TransactionInput) {
    try {
      if (editing) {
        const wasDraft = editing.source === 'receipt' && !editing.user_confirmed
        await updateTransaction.mutateAsync({ id: editing.id, input, version: editing.version })
        toast(wasDraft ? 'Receipt confirmed.' : 'Transaction updated.')
      } else {
        await createTransaction.mutateAsync(input)
        toast('Transaction added.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleDelete() {
    if (!editing) return
    const wasDraft = editing.source === 'receipt' && !editing.user_confirmed
    try {
      await deleteTransaction.mutateAsync(editing.id)
      toast(wasDraft ? 'Receipt discarded.' : 'Transaction deleted.')
      setFormOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const currency = wallet.base_currency

  const balanceMinor = transactions.reduce(
    (sum, tx) => sum + (tx.type === 'income' ? tx.amount_minor : tx.type === 'expense' ? -tx.amount_minor : 0),
    0,
  )

  const showReconcile =
    transactions.length > 0 &&
    latestReconciliation !== undefined &&
    shouldPromptReconciliation(latestReconciliation, new Date())

  async function handleReconcileAdjust(deltaMinor: number) {
    await createTransaction.mutateAsync({
      category_id: null,
      amount_minor: Math.abs(deltaMinor),
      currency,
      type: deltaMinor > 0 ? 'income' : 'expense',
      merchant: null,
      description: 'Balance reconciliation adjustment',
      transaction_date: new Date().toISOString().slice(0, 10),
    })
  }

  const coachingInsights = detectCoachingInsights({ transactions, budgets, goals, currency }).filter(
    (insight) => !dismissedInsightIds.has(insight.id),
  )

  function runInsightAction(action: CoachingAction) {
    switch (action.kind) {
      case 'create-budget':
      case 'view-budgets':
        navigate('/budgets')
        break
      case 'fund-goal':
      case 'view-goals':
        navigate('/goals')
        break
    }
  }

  function dismissInsight(id: string) {
    setDismissedInsightIds((prev) => new Set(prev).add(id))
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4 pb-28">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-xl font-semibold">Transactions</h1>
      </header>

      {coachingInsights.length > 0 && (
        <div className="flex flex-col gap-3">
          {coachingInsights.map((insight) => (
            <AiInsightActionCard
              key={insight.id}
              insight={insight}
              onAction={runInsightAction}
              onDismiss={() => dismissInsight(insight.id)}
            />
          ))}
        </div>
      )}

      {showReconcile && session && (
        <ReconcilePrompt
          walletId={wallet.id}
          userId={session.user.id}
          currency={currency}
          computedBalanceMinor={balanceMinor}
          onResolved={() => {}}
          onAdjust={handleReconcileAdjust}
        />
      )}

      {isTransactionsLoading ? (
        <div className={cn('flex flex-col gap-3 pt-2')}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-1 py-2">
              <div className="size-10 animate-pulse rounded-full bg-muted" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-3 w-32 animate-pulse rounded-full bg-muted" />
                <div className="h-2.5 w-20 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="h-3 w-16 animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <TransactionList transactions={transactions} onSelect={openEditForm} />
      )}

      <Button
        onClick={openAddForm}
        size="icon"
        className="fixed bottom-6 right-6 size-14 rounded-full shadow-lg"
        aria-label="Add transaction"
      >
        <Plus className="size-6" />
      </Button>

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        currency={currency}
        transaction={editing}
        draft={null}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : undefined}
        isSubmitting={createTransaction.isPending || updateTransaction.isPending}
      />
    </main>
  )
}
