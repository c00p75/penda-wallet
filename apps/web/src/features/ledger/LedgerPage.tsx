import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Sparkles, Split, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DateChip } from '@/components/ui/date-chip'
import { SectionHeader } from '@/components/ui/section-header'
import { ActivityRow } from '@/components/ui/activity-row'
import { BottomNav } from '@/components/BottomNav'
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
import type { Transaction, TransactionInput } from '@/features/transactions/types'
import { detectCoachingInsights } from '@/features/coaching/detectCoachingInsights'
import type { CoachingAction, CoachingInsight } from '@/features/coaching/detectCoachingInsights'
import { ReconcilePrompt } from '@/features/reconciliation/ReconcilePrompt'
import { useLatestReconciliation } from '@/features/reconciliation/hooks'
import { shouldPromptReconciliation } from '@/features/reconciliation/reconcile'
import { enqueueTransaction } from '@/pwa/offlineQueue'
import { useOfflinePending } from '@/pwa/useOfflineQueue'
import { supabase } from '@/lib/supabase/client'
import { SplitExpenseSheet } from '@/features/splits/SplitExpenseSheet'
import { formatMoney } from '@/lib/money'
import { addLocalDays, localDateStr, localMonthStart } from '@/lib/dates'
import { HiddenAmount } from '@/features/lock/HiddenAmount'

type Period = 'today' | '7d' | '30d' | 'month' | 'year' | 'all'

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
      className="relative rounded-[1.5rem] border-2 p-4"
      style={{
        borderColor: 'var(--iris)',
        background: 'color-mix(in srgb, var(--iris) 8%, var(--card))',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss insight"
        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <div
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--iris)' }}
      >
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

function groupByDate(transactions: Transaction[]) {
  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    const existing = groups.get(tx.transaction_date)
    if (existing) existing.push(tx)
    else groups.set(tx.transaction_date, [tx])
  }
  return Array.from(groups.entries())
}

function formatDateHeading(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function periodCutoff(period: Period): string | null {
  const now = new Date()
  switch (period) {
    case 'today':
      return localDateStr(now)
    case '7d':
      return addLocalDays(now, -6)
    case '30d':
      return addLocalDays(now, -29)
    case 'month':
      return localMonthStart(now)
    case 'year':
      return `${now.getFullYear()}-01-01`
    case 'all':
      return null
  }
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
  const offlineQueue = useOfflinePending()

  const { data: latestReconciliation } = useLatestReconciliation(wallet?.id, session?.user.id)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [dismissedInsightIds, setDismissedInsightIds] = useState<Set<string>>(new Set())
  const [splitTx, setSplitTx] = useState<Transaction | null>(null)
  const [members, setMembers] = useState<{ user_id: string; label: string }[]>([])
  const [period, setPeriod] = useState<Period>('month')
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all')

  useEffect(() => {
    if (!wallet?.id) return
    void supabase
      .from('wallet_members')
      .select('user_id, profiles(display_name)')
      .eq('wallet_id', wallet.id)
      .then(({ data }) => {
        setMembers(
          (data ?? []).map((row) => {
            const profile = row.profiles as unknown as { display_name: string | null } | null
            return {
              user_id: row.user_id as string,
              label: profile?.display_name?.trim() || `Member ${String(row.user_id).slice(0, 4)}`,
            }
          }),
        )
      })
  }, [wallet?.id])

  function openAddForm() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEditForm(tx: Transaction) {
    setEditing(tx)
    setFormOpen(true)
  }

  async function saveOffline(input: TransactionInput) {
    if (!wallet || !session) return
    await enqueueTransaction(wallet.id, session.user.id, input)
    await offlineQueue.refreshCount()
    toast("Saved offline — it'll sync when you're back online.")
  }

  async function handleSubmit(input: TransactionInput) {
    if (!editing && !navigator.onLine) {
      await saveOffline(input)
      return
    }
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
      if (!editing && error instanceof TypeError) {
        await saveOffline(input)
        return
      }
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

  const filtered = useMemo(() => {
    const cutoff = periodCutoff(period)
    return transactions.filter((tx) => {
      if (cutoff && tx.transaction_date < cutoff) return false
      if (categoryFilter !== 'all' && (tx.category_id ?? 'uncategorized') !== categoryFilter) return false
      return true
    })
  }, [transactions, period, categoryFilter])

  const groups = useMemo(() => groupByDate(filtered), [filtered])

  const usedCategories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; icon: string | null }>()
    for (const tx of transactions) {
      const id = tx.category_id ?? 'uncategorized'
      if (!map.has(id)) {
        map.set(id, {
          id,
          name: tx.category?.name ?? 'Uncategorized',
          icon: tx.category?.icon ?? null,
        })
      }
    }
    return Array.from(map.values()).slice(0, 8)
  }, [transactions])

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
      transaction_date: localDateStr(),
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
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 rounded-2xl bg-card shadow-[var(--shadow-soft)] ring-1 ring-border/50"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
      </header>

      <DateChip
        value={period}
        onChange={(v) => setPeriod(v as Period)}
        options={[
          { value: 'today', label: 'Today' },
          { value: '7d', label: '7d' },
          { value: '30d', label: '30d' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
          { value: 'all', label: 'All' },
        ]}
      />

      {usedCategories.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
              categoryFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'border border-border/70 bg-card text-muted-foreground'
            }`}
          >
            All
          </button>
          {usedCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryFilter(c.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                categoryFilter === c.id
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border/70 bg-card text-muted-foreground'
              }`}
            >
              <span>{c.icon ?? '💳'}</span>
              {c.name}
            </button>
          ))}
        </div>
      )}

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
        <div className="flex flex-col gap-3 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <p className="font-medium text-foreground">No transactions</p>
          <p className="text-sm">Nothing in this period yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([date, txs]) => (
            <section key={date}>
              <SectionHeader
                title={
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {formatDateHeading(date)}
                  </span>
                }
                className="mb-2"
              />
              <div className="flex flex-col gap-2.5">
                {txs.map((tx) => {
                  const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''
                  return (
                    <ActivityRow
                      key={tx.id}
                      onClick={() => openEditForm(tx)}
                      avatar={<span>{tx.category?.icon ?? (tx.type === 'income' ? '💰' : '💳')}</span>}
                      title={tx.merchant || tx.description || tx.category?.name || 'Transaction'}
                      subtitle={tx.category?.name ?? 'Uncategorized'}
                      trailing={
                        <span
                          style={{
                            color: tx.type === 'income' ? 'var(--mint)' : 'var(--foreground)',
                          }}
                        >
                          <HiddenAmount>
                            {sign}
                            {formatMoney(tx.amount_minor, tx.currency || currency)}
                          </HiddenAmount>
                        </span>
                      }
                      showChevron
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Button
        onClick={openAddForm}
        size="icon"
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-6 size-14 rounded-full shadow-lg"
        aria-label="Add transaction"
      >
        <Plus className="size-6" />
      </Button>

      {editing?.type === 'expense' && members.length > 1 && formOpen && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="fixed bottom-[calc(9.5rem+env(safe-area-inset-bottom))] right-6 gap-1.5 rounded-full shadow-md"
          onClick={() => {
            setSplitTx(editing)
            setFormOpen(false)
          }}
        >
          <Split className="size-3.5" />
          Split
        </Button>
      )}

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        currency={currency}
        walletId={wallet.id}
        transaction={editing}
        draft={null}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : undefined}
        isSubmitting={createTransaction.isPending || updateTransaction.isPending}
      />

      {session && (
        <SplitExpenseSheet
          open={!!splitTx}
          onOpenChange={(open) => !open && setSplitTx(null)}
          walletId={wallet.id}
          transaction={splitTx}
          currency={currency}
          members={members}
          currentUserId={session.user.id}
        />
      )}

      <BottomNav />
    </main>
  )
}
