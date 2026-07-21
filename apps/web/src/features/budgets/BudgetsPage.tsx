import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useDeepLinkEntityOpen } from '@/features/chat/useDeepLinkEntityOpen'
import { fetchBudget } from '@/features/budgets/api'
import { MessageCircle, Pencil, Plus } from 'lucide-react'
import { Lightbulb, Sparkle } from '@/components/icons/product'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { HeroCard } from '@/components/ui/hero-card'
import { SectionHeader } from '@/components/ui/section-header'
import { cardAccentClass } from '@/components/ui/cardAccent'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { AiInsight } from '@/components/AiInsight'
import { formatMoney } from '@/lib/money'
import { captureOverlayOrigin } from '@/lib/overlayOrigin'
import { cn } from '@/lib/utils'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { localDateStr, localMonthEnd, localMonthStart } from '@/lib/dates'
import { useChatStore } from '@/features/chat/chatStore'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useCategories } from '@/features/categories/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { useProfile } from '@/features/profile/hooks'
import { resolveAiPersonality } from '@/features/profile/types'
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
import type { Budget, BudgetInput, BudgetProgress } from './types'
import type { Category } from '@/features/categories/types'
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
  const [searchParams] = useSearchParams()
  const deepLinkBudgetId = searchParams.get('budget')
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
  const [pactsOpen, setPactsOpen] = useState(false)
  const [envelopeSheet, setEnvelopeSheet] = useState<{
    budget: Budget
    progress: BudgetProgress
    category: Category | null
  } | null>(null)

  useEffect(() => {
    if (window.location.hash === '#pacts') {
      setTab('budgets')
      setPactsOpen(true)
      requestAnimationFrame(() => document.getElementById('pacts')?.scrollIntoView({ behavior: 'smooth' }))
    }
  }, [])

  // Chat "View" deep link: open the budget form as soon as the id is known.
  useDeepLinkEntityOpen({
    kind: 'budget',
    paramId: deepLinkBudgetId,
    list: budgets,
    fetchById: fetchBudget,
    onOpen: (budget) => {
      setTab('budgets')
      setEditingBudget(budget)
      setBudgetFormOpen(true)
    },
  })

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
            resolveAiPersonality(profile?.ai_personality),
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

  const currency = wallet.base_currency

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
  const isSetup = budgets.length === 0

  const monthSpentMinor = transactions
    .filter((tx) => tx.type === 'expense' && tx.transaction_date >= monthStart)
    .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)

  const safe = plan
    ? computeSafeToSpend({
        intendedMinor: plan.intended_amount_minor,
        spentMinor: monthSpentMinor,
        upcomingFixedMinor:
          upcomingFixedCosts(recurring, localDateStr(now), localMonthEnd(now)).totalMinor +
          totalMonthlyGoalReserve(goals, now),
        monthStart,
        now,
      })
    : null

  const monthlyProgress = progress.filter((p) => p.period === 'monthly')
  const totalCap = monthlyProgress.reduce((s, p) => s + p.effective_amount_minor, 0)
  const totalSpent = monthlyProgress.reduce((s, p) => s + p.spent_minor, 0)
  const spentPct = totalCap > 0 ? Math.min(100, Math.round((totalSpent / totalCap) * 100)) : 0
  const envelopeRemaining = totalCap - totalSpent

  // One coaching line for steer; setup uses step copy instead of competing insights.
  const insight: { tone: 'default' | 'warm' | 'attention'; text: string } | null =
    tab === 'recurring'
      ? recurring.length === 0
        ? null
        : {
            tone: 'default',
            text: `${recurring.length} recurring ${recurring.length === 1 ? 'bill posts' : 'bills post'} on their own. Tap one to edit.`,
          }
      : isSetup
        ? null
        : (() => {
            if (safe && safe.discretionaryRemainingMinor < 0) {
              return {
                tone: 'attention' as const,
                text: `Your ${monthLabel} plan is spoken for once bills are covered. Want help rebalancing?`,
              }
            }
            if (progress.length === 0) return null
            const worst = progress
              .map((p) => ({
                name: categories.find((c) => c.id === p.category_id)?.name ?? 'Overall',
                pct: p.effective_amount_minor > 0 ? p.spent_minor / p.effective_amount_minor : 0,
                remaining: p.effective_amount_minor - p.spent_minor,
              }))
              .sort((a, b) => b.pct - a.pct)[0]
            if (worst.pct >= 1)
              return {
                tone: 'attention' as const,
                text: `${worst.name} is over. Want me to help you rebalance?`,
              }
            if (worst.pct >= 0.8)
              return {
                tone: 'warm' as const,
                text: `${worst.name} is running warm, ${formatMoney(worst.remaining, currency)} left.`,
              }
            return {
              tone: 'default' as const,
              text: `Envelopes look steady. Ask me before a bigger buy if you want a second opinion.`,
            }
          })()

  function openEnvelope(p: BudgetProgress) {
    const budget = budgets.find((b) => b.id === p.budget_id)
    if (!budget) return
    setEnvelopeSheet({
      budget,
      progress: p,
      category: categories.find((c) => c.id === p.category_id) ?? null,
    })
  }

  function askAboutEnvelope() {
    if (!envelopeSheet) return
    const name = envelopeSheet.category?.name ?? 'this envelope'
    const rem = envelopeSheet.progress.effective_amount_minor - envelopeSheet.progress.spent_minor
    const prompt = `${name} has ${formatMoney(Math.abs(rem), currency)} ${rem >= 0 ? 'left' : 'over'} of ${formatMoney(envelopeSheet.progress.effective_amount_minor, currency)}. What should I do?`
    setEnvelopeSheet(null)
    openChat(prompt, { autoSend: true, mode: 'full' })
  }

  const heroUsesSafe = !!safe && safe.discretionaryRemainingMinor >= 0

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24">
      <AppHeader />

      <section className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[2rem] font-bold tracking-tight leading-tight">Plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {monthLabel}
            {tab === 'budgets'
              ? isSetup
                ? ' · set your intention'
                : ' · what you can spend'
              : ' · bills on autopilot'}
          </p>
        </div>
        <Link
          to="/goals"
          className="shrink-0 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Goals →
        </Link>
      </section>

      <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as typeof tab)} className="w-full">
        <ToggleGroupItem value="budgets" className="flex-1 rounded-full">
          Budgets
        </ToggleGroupItem>
        <ToggleGroupItem value="recurring" className="flex-1 rounded-full">
          Recurring
        </ToggleGroupItem>
      </ToggleGroup>

      {tab === 'budgets' && isSetup && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 px-1">
            <span className="grid size-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {plan ? '2' : '1'}
            </span>
            <p className="text-sm font-medium">
              {plan ? 'Split into envelopes' : 'Set a month intention'}
            </p>
          </div>

          {!plan ? (
            <>
              <AiInsight featured>
                Start with one number for {monthLabel}. Then we’ll break it into a few envelopes.
              </AiInsight>
              <SpendingPlanCard
                walletId={wallet.id}
                currency={currency}
                transactions={transactions}
              />
            </>
          ) : (
            <>
              <AiInsight featured askText={`I set my ${monthLabel} plan. Help me split it into envelopes.`}>
                Plan set at {formatMoney(plan.intended_amount_minor, currency)}. Split it
                into a few envelopes next.
              </AiInsight>
              <SpendingPlanCard
                walletId={wallet.id}
                currency={currency}
                transactions={transactions}
                variant="compact"
              />
              <div className="flex flex-col gap-2">
                {suggestions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSuggestOpen(true)}
                    className={cn(
                      'flex items-center gap-3 rounded-[1.5rem] bg-card p-4 text-left shadow-[var(--shadow-soft)] transition-transform active:scale-[0.99]',
                      cardAccentClass('iris'),
                    )}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--iris-soft)] text-[var(--iris)]">
                      <Lightbulb className="size-5" weight="duotone" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {historySuggestions.length > 0 ? 'Suggest from spending' : 'Use starter envelopes'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {suggestions.length} ready to tweak and save
                      </p>
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    captureOverlayOrigin(e.currentTarget)
                    openChat(
                      `I set my ${monthLabel} spending plan at ${formatMoney(plan.intended_amount_minor, currency)}. Help me split it into a few budget categories.`,
                      { autoSend: true, mode: 'full' },
                    )
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-[1.5rem] bg-card p-4 text-left shadow-[var(--shadow-soft)] transition-transform active:scale-[0.99]',
                    cardAccentClass('mint'),
                  )}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--mint-soft)] text-[var(--mint)]">
                    <Sparkle className="size-5" weight="fill" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">Split with Penda</p>
                    <p className="text-sm text-muted-foreground">Chat through a fit that matches you</p>
                  </div>
                </button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setEditingBudget(null)
                    setBudgetFormOpen(true)
                  }}
                >
                  Add one envelope myself
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'budgets' && !isSetup && (
        <>
          <HeroCard
            tone={
              heroUsesSafe
                ? 'iris'
                : spentPct >= 100
                  ? 'rose'
                  : spentPct >= 80
                    ? 'apricot'
                    : 'mint'
            }
            className="w-full min-h-[8.25rem]"
          >
            <div className="flex w-full items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/85">
                  {heroUsesSafe
                    ? 'Safe to spend'
                    : envelopeRemaining >= 0
                      ? 'Left in envelopes'
                      : 'Over envelopes'}
                </p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {heroUsesSafe ? (
                    <>
                      <HiddenAmount>
                        {formatMoney(safe!.perDayMinor, currency)}
                      </HiddenAmount>
                      <span className="text-base font-medium opacity-80"> /day</span>
                    </>
                  ) : (
                    <HiddenAmount>
                      {formatMoney(Math.abs(envelopeRemaining), currency)}
                    </HiddenAmount>
                  )}
                </p>
                <p className="mt-1.5 text-sm text-white/80">
                  {heroUsesSafe ? (
                    <>
                      after bills ·{' '}
                      <HiddenAmount>
                        {formatMoney(safe!.discretionaryRemainingMinor, currency)}
                      </HiddenAmount>{' '}
                      left in plan
                    </>
                  ) : (
                    <>
                      <HiddenAmount>{formatMoney(totalSpent, currency)}</HiddenAmount>
                      {' of '}
                      <HiddenAmount>{formatMoney(totalCap, currency)}</HiddenAmount>
                      {' this month'}
                    </>
                  )}
                </p>
              </div>
              {!heroUsesSafe && (
                <div className="relative grid size-[4.5rem] shrink-0 place-items-center">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `conic-gradient(white ${spentPct}%, color-mix(in srgb, white 25%, transparent) 0)`,
                      WebkitMaskImage:
                        'radial-gradient(circle closest-side, transparent 70%, black 71%)',
                      maskImage: 'radial-gradient(circle closest-side, transparent 70%, black 71%)',
                    }}
                  />
                  <span className="relative text-base font-bold tabular-nums">{spentPct}%</span>
                </div>
              )}
            </div>
          </HeroCard>

          {insight && (
            <AiInsight featured tone={insight.tone} askText={insight.text}>
              {insight.text}
            </AiInsight>
          )}

          <SpendingPlanCard
            walletId={wallet.id}
            currency={currency}
            transactions={transactions}
            variant="compact"
          />

          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Envelopes"
              actionLabel="Add"
              onAction={() => {
                setEditingBudget(null)
                setBudgetFormOpen(true)
              }}
            />
            <div className="grid grid-cols-2 gap-3">
              {progress.map((p) => (
                <BudgetProgressCard
                  key={p.budget_id}
                  progress={p}
                  category={categories.find((c) => c.id === p.category_id) ?? null}
                  currency={currency}
                  onSelect={() => openEnvelope(p)}
                />
              ))}
              <button
                type="button"
                onClick={() => {
                  setEditingBudget(null)
                  setBudgetFormOpen(true)
                }}
                className="flex min-h-[9.5rem] flex-col items-center justify-center gap-2 rounded-[1.5rem] border-2 border-dashed border-border/70 p-4 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Plus className="size-5" />
                <span className="text-sm font-medium">Add</span>
              </button>
            </div>
          </section>

          <section id="pacts" className="flex scroll-mt-4 flex-col gap-2">
            <button
              type="button"
              onClick={() => setPactsOpen((v) => !v)}
              className="flex items-center justify-between px-1 text-left"
            >
              <span className="text-sm font-medium text-muted-foreground">
                Commitment pacts{pacts.length > 0 ? ` · ${pacts.length}` : ''}
              </span>
              <span className="text-sm font-medium text-primary">{pactsOpen ? 'Hide' : 'Show'}</span>
            </button>
            {pactsOpen && (
              <div className="flex flex-col gap-3">
                {pacts.length === 0 ? (
                  <p className="px-1 text-sm text-muted-foreground">
                    Optional promises, like a weekly spend cap. Penda will check in.
                  </p>
                ) : (
                  pacts.map((pact) => (
                    <PactCard
                      key={pact.id}
                      pact={pact}
                      transactions={transactions}
                      category={categories.find((c) => c.id === pact.category_id) ?? null}
                      currency={currency}
                      onDelete={() => handlePactDelete(pact.id)}
                    />
                  ))
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => setPactFormOpen(true)}>
                  New pact
                </Button>
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'recurring' && (
        <>
          {insight && (
            <AiInsight featured tone={insight.tone} askText={insight.text}>
              {insight.text}
            </AiInsight>
          )}
          <RecurringList
            recurring={recurring}
            categories={categories}
            onSelect={(rule) => {
              setEditingRecurring(rule)
              setRecurringFormOpen(true)
            }}
            onToggleActive={(rule, isActive) => setRecurringActive.mutate({ id: rule.id, isActive })}
          />
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
        </>
      )}

      <Sheet open={!!envelopeSheet} onOpenChange={(open) => !open && setEnvelopeSheet(null)}>
        <SheetContent side="bottom" className="border-0 ring-0">
          <SheetHeader>
            <SheetTitle>{envelopeSheet?.category?.name ?? 'Envelope'}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-2 pb-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 justify-start gap-3"
              onClick={() => {
                if (!envelopeSheet) return
                setEditingBudget(envelopeSheet.budget)
                setEnvelopeSheet(null)
                setBudgetFormOpen(true)
              }}
            >
              <Pencil className="size-4" />
              Edit envelope
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 justify-start gap-3"
              onClick={askAboutEnvelope}
            >
              <MessageCircle className="size-4" />
              Ask Penda
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <BudgetForm
        open={budgetFormOpen}
        onOpenChange={setBudgetFormOpen}
        categories={categories}
        currency={currency}
        budget={editingBudget}
        onSubmit={handleBudgetSubmit}
        onDelete={editingBudget ? handleBudgetDelete : undefined}
        isSubmitting={createBudget.isPending || updateBudget.isPending}
      />

      <BudgetSuggestionsSheet
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        suggestions={suggestions}
        currency={currency}
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
        currency={currency}
        recurring={editingRecurring}
        onSubmit={handleRecurringSubmit}
        onDelete={editingRecurring ? handleRecurringDelete : undefined}
        isSubmitting={createRecurring.isPending || updateRecurring.isPending}
      />

      <BottomNav />
    </main>
  )
}
