import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Lightbulb } from '@/components/icons/product'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { HeroCard } from '@/components/ui/hero-card'
import { SectionHeader } from '@/components/ui/section-header'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { AiInsight } from '@/components/AiInsight'
import { formatMoney } from '@/lib/money'
import { captureOverlayOrigin } from '@/lib/overlayOrigin'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { localDateStr, localMonthEnd, localMonthStart } from '@/lib/dates'
import { useChatStore } from '@/features/chat/chatStore'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useCategories } from '@/features/categories/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { useProfile } from '@/features/profile/hooks'
import { useSavingsGoals } from '@/features/goals/hooks'
import { totalMonthlyGoalReserve } from '@/features/goals/goalContribution'
import { useBudgetProgress, useBudgets, useCreateBudget, useDeleteBudget, useUpdateBudget } from './hooks'
import { BudgetForm } from './BudgetForm'
import { BudgetProgressCard } from './BudgetProgressCard'
import { BudgetSuggestionsSheet } from './BudgetSuggestionsSheet'
import { suggestBudgets, type BudgetSuggestion } from './suggestBudgets'
import { starterBudgetsForPersona } from './starterBudgets'
import { SpendingPlanCard } from '@/features/planning/SpendingPlanCard'
import { useSpendingPlan } from '@/features/planning/hooks'
import { computeSafeToSpend } from '@/features/planning/spendingPlan'
import { upcomingFixedCosts } from '@/features/planning/fixedCosts'
import { usePacts, useCreatePact, useDeletePact } from '@/features/pacts/hooks'
import { PactCard } from '@/features/pacts/PactCard'
import { PactForm } from '@/features/pacts/PactForm'
import type { CommitmentPactInput } from '@/features/pacts/types'
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
  const openChat = useChatStore((s) => s.openChat)
  const { data: wallet } = useCurrentWallet()
  const { data: categories = [] } = useCategories(wallet?.id)
  const { data: profile } = useProfile(session?.user.id)

  const { data: budgets = [] } = useBudgets(wallet?.id)
  const { data: progress = [] } = useBudgetProgress(wallet?.id)
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: goals = [] } = useSavingsGoals(wallet?.id)
  const createBudget = useCreateBudget(wallet?.id)
  const updateBudget = useUpdateBudget(wallet?.id)
  const deleteBudget = useDeleteBudget(wallet?.id)

  const now = new Date()
  const monthStart = localMonthStart(now)
  const { data: plan } = useSpendingPlan(wallet?.id, monthStart)

  const { data: recurring = [] } = useRecurringTransactions(wallet?.id)
  const createRecurring = useCreateRecurringTransaction(wallet?.id)
  const updateRecurring = useUpdateRecurringTransaction(wallet?.id)
  const setRecurringActive = useSetRecurringActive(wallet?.id)
  const deleteRecurring = useDeleteRecurringTransaction(wallet?.id)

  const { data: pacts = [] } = usePacts(wallet?.id)
  const createPact = useCreatePact(wallet?.id)
  const deletePact = useDeletePact(wallet?.id)
  const [pactFormOpen, setPactFormOpen] = useState(false)

  const [tab, setTab] = useState<'budgets' | 'recurring'>('budgets')
  const [budgetFormOpen, setBudgetFormOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [recurringFormOpen, setRecurringFormOpen] = useState(false)
  const [editingRecurring, setEditingRecurring] = useState<RecurringTransaction | null>(null)

  useEffect(() => {
    if (window.location.hash === '#pacts') {
      setTab('budgets')
      requestAnimationFrame(() => document.getElementById('pacts')?.scrollIntoView({ behavior: 'smooth' }))
    }
  }, [])

  const existingBudgetCategoryIds = useMemo(
    () => budgets.map((b) => b.category_id).filter((id): id is string => !!id),
    [budgets],
  )

  const historySuggestions = useMemo(
    () => suggestBudgets(transactions, { existingCategoryIds: existingBudgetCategoryIds }),
    [transactions, existingBudgetCategoryIds],
  )

  // Cold start: no spending pattern to learn from yet, but a plan is set , 
  // offer a sensible persona-flavored split instead of leaving budgets at zero.
  const starterSuggestions = useMemo(
    () =>
      historySuggestions.length === 0 && plan
        ? starterBudgetsForPersona(
            profile?.ai_personality ?? 'balanced_coach',
            plan.intended_amount_minor,
            categories,
            existingBudgetCategoryIds,
          )
        : [],
    [historySuggestions, plan, profile?.ai_personality, categories, existingBudgetCategoryIds],
  )

  const suggestions = historySuggestions.length > 0 ? historySuggestions : starterSuggestions

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

  async function handlePactSubmit(input: CommitmentPactInput) {
    try {
      await createPact.mutateAsync(input)
      toast('Pact set. I\'ll hold you to it.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handlePactDelete(id: string) {
    try {
      await deletePact.mutateAsync(id)
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

  const monthLabel = now.toLocaleDateString(undefined, { month: 'long' })

  // The headline number, when a plan exists: what's genuinely free per day after
  // reserving the fixed bills still due this month. Leads the budgets-tab insight.
  const safeToSpendInsight: { tone: 'default' | 'warm' | 'attention'; text: string } | null = (() => {
    if (!plan) return null
    const monthEnd = localMonthEnd(now)
    const spentMinor = transactions
      .filter((tx) => tx.type === 'expense' && tx.transaction_date >= monthStart)
      .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)
    const upcoming = upcomingFixedCosts(recurring, localDateStr(now), monthEnd)
    const goalReserve = totalMonthlyGoalReserve(goals, now)
    const safe = computeSafeToSpend({
      intendedMinor: plan.intended_amount_minor,
      spentMinor,
      upcomingFixedMinor: upcoming.totalMinor + goalReserve,
      monthStart,
      now,
    })
    if (safe.discretionaryRemainingMinor < 0)
      return {
        tone: 'attention',
        text: `Your ${monthLabel} plan is already spoken for once bills are covered, want to rebalance?`,
      }
    return {
      tone: 'default',
      text: `You can safely spend about ${formatMoney(safe.perDayMinor, wallet.base_currency)}/day for the rest of ${monthLabel}.`,
    }
  })()

  // AI speaks first: a real read of this page's own data, tab-aware. Safe-to-spend
  // leads when a plan is set; otherwise fall back to how the budgets are tracking.
  const insight: { tone: 'default' | 'warm' | 'attention'; text: string } | null =
    tab === 'budgets'
      ? (safeToSpendInsight ??
        (progress.length === 0
          ? null
          : (() => {
            const worst = progress
              .map((p) => ({
                name: categories.find((c) => c.id === p.category_id)?.name ?? 'Overall',
                pct: p.effective_amount_minor > 0 ? p.spent_minor / p.effective_amount_minor : 0,
                remaining: p.effective_amount_minor - p.spent_minor,
              }))
              .sort((a, b) => b.pct - a.pct)[0]
            if (worst.pct >= 1)
              return { tone: 'attention', text: `${worst.name} is over budget, want me to help you rebalance?` }
            if (worst.pct >= 0.8)
              return {
                tone: 'warm',
                text: `${worst.name} is running warm, ${formatMoney(worst.remaining, wallet.base_currency)} left.`,
              }
            return {
              tone: 'default',
              text: `You’re comfortable across all ${progress.length} budget${progress.length === 1 ? '' : 's'}. Nice work.`,
            }
          })()))
      : recurring.length === 0
        ? null
        : {
            tone: 'default',
            text: `${recurring.length} recurring ${recurring.length === 1 ? 'transaction posts' : 'transactions post'} automatically, that’s ${recurring.length === 1 ? 'one bill' : 'that many bills'} you’ll never forget.`,
          }

  const monthlyProgress = progress.filter((p) => p.period === 'monthly')
  const totalCap = monthlyProgress.reduce((s, p) => s + p.effective_amount_minor, 0)
  const totalSpent = monthlyProgress.reduce((s, p) => s + p.spent_minor, 0)
  const spentPct = totalCap > 0 ? Math.min(100, Math.round((totalSpent / totalCap) * 100)) : 0
  const remaining = totalCap - totalSpent

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24">
      <AppHeader />

      <section className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[2rem] font-bold tracking-tight leading-tight">Plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">{monthLabel} · budgets & commitments</p>
        </div>
        <Link
          to="/goals"
          className="shrink-0 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Goals →
        </Link>
      </section>

      {tab === 'budgets' && totalCap > 0 && (
        <HeroCard tone={spentPct >= 100 ? 'rose' : spentPct >= 80 ? 'apricot' : 'iris'} className="w-full min-h-[8.5rem]">
          <div className="flex w-full items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white/85">Spent this month</p>
              <p className="mt-2 text-3xl font-bold tabular-nums">
                <HiddenAmount>{formatMoney(totalSpent, wallet.base_currency)}</HiddenAmount>
              </p>
              <p className="mt-1 text-sm text-white/80">
                <HiddenAmount>{formatMoney(Math.abs(remaining), wallet.base_currency)}</HiddenAmount>
                {remaining >= 0 ? ' left' : ' over'} of{' '}
                <HiddenAmount>{formatMoney(totalCap, wallet.base_currency)}</HiddenAmount>
              </p>
            </div>
            <div className="relative grid size-20 shrink-0 place-items-center">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(white ${spentPct}%, color-mix(in srgb, white 25%, transparent) 0)`,
                  WebkitMaskImage: 'radial-gradient(circle closest-side, transparent 72%, black 73%)',
                  maskImage: 'radial-gradient(circle closest-side, transparent 72%, black 73%)',
                }}
              />
              <span className="relative text-lg font-bold tabular-nums">{spentPct}%</span>
            </div>
          </div>
        </HeroCard>
      )}

      {insight && (
        <AiInsight tone={insight.tone} askText={insight.text}>
          {insight.text}
        </AiInsight>
      )}

      <div className="flex flex-wrap gap-2">
        {[
          'How are my budgets doing?',
          'Help me rebalance this month',
          'What should I cut first?',
        ].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => openChat(q, { autoSend: true })}
            className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)] hover:bg-accent/60 hover:text-foreground"
          >
            {q}
          </button>
        ))}
      </div>

      <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as typeof tab)} className="w-full">
        <ToggleGroupItem value="budgets" className="flex-1 rounded-full">
          Budgets
        </ToggleGroupItem>
        <ToggleGroupItem value="recurring" className="flex-1 rounded-full">
          Recurring
        </ToggleGroupItem>
      </ToggleGroup>

      {tab === 'budgets' && (
        <SpendingPlanCard walletId={wallet.id} currency={wallet.base_currency} transactions={transactions} />
      )}

      {tab === 'budgets' && suggestions.length > 0 && (
        <button
          type="button"
          onClick={() => setSuggestOpen(true)}
          className="flex items-center gap-3 rounded-[1.35rem] border border-border/60 bg-card p-4 text-left shadow-[var(--shadow-soft)] transition-colors hover:bg-accent/60"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--iris-soft)] text-[var(--iris)]">
            <Lightbulb className="size-5" weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Suggest budgets</p>
            <p className="text-sm text-muted-foreground">
              {historySuggestions.length > 0
                ? 'Optimize based on your spending habits'
                : `Get ${suggestions.length} starter budget${suggestions.length === 1 ? '' : 's'} to begin`}
            </p>
          </div>
        </button>
      )}

      {tab === 'budgets' ? (
        <div className="flex flex-col gap-2">
          <SectionHeader title="Categories" />
          {budgets.length === 0 && (
            <p className="px-1 text-sm text-muted-foreground">
              No budgets yet, tap Add New to set a weekly or monthly spending limit.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
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
            <button
              type="button"
              onClick={() => {
                setEditingBudget(null)
                setBudgetFormOpen(true)
              }}
              className="flex flex-col items-center justify-center gap-2 rounded-[1.35rem] border-2 border-dashed border-border p-4 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Plus className="size-5" />
              <span className="text-sm font-medium">Add New</span>
            </button>
          </div>
        </div>
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

      {tab === 'budgets' && (
        <div id="pacts" className="flex scroll-mt-4 flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Commitment pacts</p>
            <button type="button" onClick={() => setPactFormOpen(true)} className="text-sm text-primary">
              + New pact
            </button>
          </div>
          {pacts.map((pact) => (
            <PactCard
              key={pact.id}
              pact={pact}
              transactions={transactions}
              category={categories.find((c) => c.id === pact.category_id) ?? null}
              currency={wallet.base_currency}
              onDelete={() => handlePactDelete(pact.id)}
            />
          ))}
        </div>
      )}

      {tab === 'recurring' && (
        <Button
          onClick={(e) => {
            captureOverlayOrigin(e.currentTarget)
            setEditingRecurring(null)
            setRecurringFormOpen(true)
          }}
          size="icon"
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-6 h-14 w-14 rounded-full shadow-[var(--shadow-card)] transition-transform active:scale-95"
          aria-label="Add recurring transaction"
        >
          <Plus className="size-6" />
        </Button>
      )}

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

      <PactForm
        open={pactFormOpen}
        onOpenChange={setPactFormOpen}
        categories={categories}
        onSubmit={handlePactSubmit}
        isSubmitting={createPact.isPending}
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
