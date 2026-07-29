import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { suggestMilestones } from '@penda/money-core'
import { useDeepLinkEntityOpen } from '@/features/chat/useDeepLinkEntityOpen'
import { fetchDebt } from '@/features/debts/api'
import { ArrowUpDown, Check, Plus, Sparkles } from 'lucide-react'
import { Target } from '@/components/icons/product'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { HeroCard } from '@/components/ui/hero-card'
import { SectionHeader } from '@/components/ui/section-header'
import { cardAccentClass } from '@/components/ui/cardAccent'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { AiInsight } from '@/components/AiInsight'
import { TipNote } from '@/components/ui/tip-note'
import { formatMoney } from '@/lib/money'
import { captureOverlayOrigin } from '@/lib/overlayOrigin'
import { cn } from '@/lib/utils'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { useChatStore } from '@/features/chat/chatStore'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useAccounts } from '@/features/accounts/hooks'
import { useProfile } from '@/features/profile/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { lifeEventActive } from '@/features/lifeEvents/types'
import {
  useAddContribution,
  useArchivedSavingsGoals,
  useContributions,
  useCreateSavingsGoal,
  useSavingsGoals,
  useUnarchiveSavingsGoal,
} from './hooks'
import { GoalForm, type GoalFormDefaults } from './GoalForm'
import { ContributionForm } from './ContributionForm'
import { GoalProgressCard } from './GoalProgressCard'
import type { SavingsGoal, SavingsGoalInput } from './types'
import {
  useAddPayment,
  useArchiveDebt,
  useArchivedDebts,
  useCreateDebt,
  useDebts,
  useUnarchiveDebt,
  useUpdateDebt,
} from '@/features/debts/hooks'
import { DebtForm } from '@/features/debts/DebtForm'
import { PaymentForm } from '@/features/debts/PaymentForm'
import { DebtProgressCard } from '@/features/debts/DebtProgressCard'
import { sortDebtsByDueDate } from '@/features/debts/dueDate'
import type { Debt, DebtInput } from '@/features/debts/types'

/** Brand-family hero variants from the #5448cc palette (iris / violet / indigo / deep). */
const GOAL_TONES = ['iris', 'apricot', 'mint', 'sun'] as const

const SETUP_PROMPTS = [
  'Help me set a savings goal for something I care about',
  'I want an emergency buffer. How much should I aim for?',
]

function GoalCardWithContributions({
  goal,
  currency,
  onSelect,
  onAddFunds,
  toneIndex,
}: {
  goal: SavingsGoal
  currency: string
  onSelect: () => void
  onAddFunds: () => void
  toneIndex: number
}) {
  const { data: contributions = [] } = useContributions(goal.id)
  return (
    <GoalProgressCard
      goal={goal}
      contributions={contributions}
      currency={currency}
      onSelect={onSelect}
      onAddFunds={onAddFunds}
      tone={GOAL_TONES[toneIndex % GOAL_TONES.length]}
    />
  )
}

export function GoalsPage() {
  const session = useAuthStore((s) => s.session)
  const navigate = useNavigate()
  const openChat = useChatStore((s) => s.openChat)
  const { data: wallet } = useCurrentWallet()
  const { data: profile } = useProfile(session?.user.id)
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: accounts = [] } = useAccounts(wallet?.id)
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkDebtId = searchParams.get('debt')
  const tabParam = searchParams.get('tab')

  const { data: goals = [] } = useSavingsGoals(wallet?.id)
  const { data: archivedGoals = [] } = useArchivedSavingsGoals(wallet?.id)
  const createGoal = useCreateSavingsGoal(wallet?.id)
  const unarchiveGoal = useUnarchiveSavingsGoal(wallet?.id)

  const { data: debts = [], isPending: debtsPending, refetch: refetchDebts } = useDebts(wallet?.id)
  const { data: archivedDebts = [] } = useArchivedDebts(wallet?.id)
  const createDebt = useCreateDebt(wallet?.id)
  const updateDebt = useUpdateDebt(wallet?.id)
  const archiveDebt = useArchiveDebt(wallet?.id)
  const unarchiveDebt = useUnarchiveDebt(wallet?.id)

  const [tab, setTab] = useState<'goals' | 'debts'>(() =>
    tabParam === 'debts' || deepLinkDebtId ? 'debts' : 'goals',
  )
  const [goalFormOpen, setGoalFormOpen] = useState(false)
  const [goalDefaults, setGoalDefaults] = useState<GoalFormDefaults | null>(null)
  const [contributingGoal, setContributingGoal] = useState<SavingsGoal | null>(null)
  const [debtFormOpen, setDebtFormOpen] = useState(false)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null)
  const [debtFilter, setDebtFilter] = useState<'outstanding' | 'cleared' | 'all'>('outstanding')
  const [debtSort, setDebtSort] = useState<'dueDate' | 'amount' | 'name'>('dueDate')
  const [debtSortMenuOpen, setDebtSortMenuOpen] = useState(false)

  const milestoneIdeas = useMemo(() => {
    if (goals.length >= 3) return []
    const today = new Date().toISOString().slice(0, 10)
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 3)
    const since = cutoff.toISOString().slice(0, 10)
    const recent = transactions.filter(
      (t) => t.type === 'expense' && t.transaction_date >= since && !t.deleted_at,
    )
    const categoryTotals = new Map<string, number>()
    const textParts: string[] = []
    for (const tx of recent) {
      const name = tx.category?.name
      if (name) {
        categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + Math.abs(tx.amount_minor))
      }
      if (tx.merchant) textParts.push(tx.merchant)
      if (tx.description) textParts.push(tx.description)
    }
    const life = profile?.life_event
    return suggestMilestones({
      mode: profile?.mode ?? 'individual',
      primaryGoals: profile?.primary_goals ?? undefined,
      householdSize: profile?.household_size ?? null,
      incomeRange: profile?.income_range ?? null,
      lifeEventKind: life && lifeEventActive(life, today) ? life.kind : null,
      existingGoalNames: goals.map((g) => g.name),
      categorySpend: [...categoryTotals.entries()].map(([categoryName, totalMinor]) => ({
        categoryName,
        totalMinor,
      })),
      textBlob: textParts.join(' ').toLowerCase(),
      hasOpenDebt: debts.some((d) => d.balance_minor > 0),
      max: 3,
    })
  }, [goals, transactions, profile, debts])

  function openNewGoal(defaults?: GoalFormDefaults | null) {
    setGoalDefaults(defaults ?? null)
    setGoalFormOpen(true)
  }

  const addContribution = useAddContribution(wallet?.id, contributingGoal?.id)
  const addPayment = useAddPayment(wallet?.id, payingDebt?.id)

  // Chat "View" deep link: debts tab and/or open the debt form for ?debt=<id>.
  useEffect(() => {
    if (tabParam !== 'debts' || deepLinkDebtId) return
    setTab('debts')
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('tab')
        return next
      },
      { replace: true },
    )
  }, [tabParam, deepLinkDebtId, setSearchParams])

  useDeepLinkEntityOpen({
    kind: 'debt',
    paramId: deepLinkDebtId,
    list: debts,
    fetchById: fetchDebt,
    clearParamKeys: ['tab'],
    onOpen: (debt) => {
      setTab('debts')
      setEditingDebt(debt)
      setDebtFormOpen(true)
    },
  })

  // Always refetch when opening Debts so chat-created IOUs show up even if a
  // prior visit cached an empty list before invalidate landed.
  useEffect(() => {
    if (tab !== 'debts' || !wallet?.id) return
    void refetchDebts()
  }, [tab, wallet?.id, refetchDebts])

  const sortedDebts = useMemo(() => {
    if (debtSort === 'amount') return [...debts].sort((a, b) => b.balance_minor - a.balance_minor)
    if (debtSort === 'name') return [...debts].sort((a, b) => a.name.localeCompare(b.name))
    return sortDebtsByDueDate(debts)
  }, [debts, debtSort])
  const filteredDebts = useMemo(() => {
    if (debtFilter === 'outstanding') return sortedDebts.filter((d) => d.balance_minor > 0)
    if (debtFilter === 'cleared') return sortedDebts.filter((d) => d.balance_minor <= 0)
    return sortedDebts
  }, [sortedDebts, debtFilter])

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  async function handleGoalSubmit(input: SavingsGoalInput, initialAmountMinor: number) {
    try {
      await createGoal.mutateAsync({ input, initialAmountMinor })
      toast('Goal added.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleGoalRestore(id: string, name: string) {
    try {
      await unarchiveGoal.mutateAsync(id)
      toast(`Restored "${name}".`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleContribution(amountMinor: number, date: string) {
    try {
      await addContribution.mutateAsync({ amountMinor, date })
      toast(amountMinor >= 0 ? 'Funds added.' : 'Withdrawal logged.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleDebtSubmit(input: DebtInput) {
    try {
      if (editingDebt) {
        await updateDebt.mutateAsync({ id: editingDebt.id, input })
        toast('Debt updated.')
      } else {
        await createDebt.mutateAsync(input)
        toast('Debt added.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleDebtArchive() {
    if (!editingDebt) return
    try {
      await archiveDebt.mutateAsync(editingDebt.id)
      toast('Debt archived.')
      setDebtFormOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleDebtRestore(id: string, name: string) {
    try {
      await unarchiveDebt.mutateAsync(id)
      toast(`Restored "${name}".`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handlePayment(amountMinor: number, date: string, accountId: string | null) {
    if (!payingDebt || !wallet) return
    try {
      await addPayment.mutateAsync({
        amountMinor,
        date,
        accountId,
        currency: wallet.base_currency,
        debtName: payingDebt.name,
        direction: payingDebt.direction,
      })
      toast('Payment logged.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  const isGoalsSetup = goals.length === 0
  // Don't flash the empty setup while the first debts fetch is in flight.
  const isDebtsSetup = !debtsPending && debts.length === 0

  const totalSaved = goals.reduce((s, g) => s + g.current_amount_minor, 0)
  const totalTarget = goals.reduce((s, g) => s + g.target_amount_minor, 0)
  const overallPct = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0
  const nearest = [...goals]
    .filter((g) => g.target_amount_minor > 0 && g.current_amount_minor < g.target_amount_minor)
    .sort(
      (a, b) =>
        b.current_amount_minor / b.target_amount_minor - a.current_amount_minor / a.target_amount_minor,
    )[0]

  const oweTotal = debts
    .filter((d) => d.direction === 'i_owe')
    .reduce((s, d) => s + Math.max(d.balance_minor, 0), 0)
  const owedTotal = debts
    .filter((d) => d.direction === 'owed_to_me')
    .reduce((s, d) => s + Math.max(d.balance_minor, 0), 0)

  const insight: { tone: 'default' | 'warm' | 'attention'; text: string } | null =
    tab === 'goals'
      ? isGoalsSetup
        ? null
        : (() => {
            const reached = goals.find(
              (g) => g.target_amount_minor > 0 && g.current_amount_minor >= g.target_amount_minor,
            )
            if (reached)
              return {
                tone: 'warm' as const,
                text: `You hit ${reached.name}. Ready to set the next one?`,
              }
            if (nearest) {
              const pct = Math.round((nearest.current_amount_minor / nearest.target_amount_minor) * 100)
              return {
                tone: 'warm' as const,
                text: `You’re ${pct}% of the way to ${nearest.name}. Want help finding a bit more to put aside?`,
              }
            }
            return {
              tone: 'default' as const,
              text: `You’ve saved ${formatMoney(totalSaved, wallet.base_currency)} toward your goals. Nice work.`,
            }
          })()
      : isDebtsSetup
        ? null
        : oweTotal > 0
          ? {
              tone: 'default' as const,
              text: `You’re paying down ${formatMoney(oweTotal, wallet.base_currency)}. One payment at a time.`,
            }
          : owedTotal > 0
            ? {
                tone: 'warm' as const,
                text: `${formatMoney(owedTotal, wallet.base_currency)} is owed to you. I’ll help you keep track.`,
              }
            : {
                tone: 'warm' as const,
                text: 'Everything looks settled. Nice clean slate.',
              }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24">
      <AppHeader />

      <section className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[2rem] font-bold tracking-tight leading-tight">
            {tab === 'goals' ? 'Goals' : 'Debts'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === 'goals'
              ? isGoalsSetup
                ? 'Name something worth saving for'
                : 'Save toward what matters'
              : isDebtsSetup
                ? 'Track what you owe, or what’s owed to you'
                : 'Pay down and settle up'}
          </p>
        </div>
        <Link
          to="/budgets"
          className="shrink-0 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Plan →
        </Link>
      </section>

      <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as typeof tab)} className="w-full">
        <ToggleGroupItem value="goals" className="flex-1 rounded-full">
          Savings
        </ToggleGroupItem>
        <ToggleGroupItem value="debts" className="flex-1 rounded-full">
          Debts
        </ToggleGroupItem>
      </ToggleGroup>

      {tab === 'goals' && isGoalsSetup && (
        <section className="flex flex-col gap-4">
          <TipNote>
            Start with one goal. A trip, a buffer, a purchase. Penda will help you pace it.
          </TipNote>

          <button
            type="button"
            onClick={(e) => {
              captureOverlayOrigin(e.currentTarget)
              openNewGoal(null)
            }}
            className={cn(
              'flex items-center gap-3 rounded-[1.5rem] bg-card p-4 text-left shadow-[var(--shadow-soft)] transition-transform active:scale-[0.99]',
              cardAccentClass('iris'),
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--iris-soft)] text-[var(--iris)]">
              <Target className="size-5" weight="duotone" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Create a savings goal</p>
              <p className="text-sm text-muted-foreground">Name it, set a target, optionally a date</p>
            </div>
          </button>

          <button
            type="button"
            onClick={(e) => {
              captureOverlayOrigin(e.currentTarget)
              openChat(SETUP_PROMPTS[0], { autoSend: true, mode: 'full' })
            }}
            className={cn(
              'flex items-center gap-3 rounded-[1.5rem] bg-card p-4 text-left shadow-[var(--shadow-soft)] transition-transform active:scale-[0.99]',
              cardAccentClass('iris'),
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--iris-soft)] text-[var(--iris)]">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Build it with Penda</p>
              <p className="text-sm text-muted-foreground">Chat through the amount and timeline</p>
            </div>
          </button>

          {milestoneIdeas.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Ideas for you</p>
              <div className="flex flex-wrap gap-2">
                {milestoneIdeas.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    onClick={(e) => {
                      captureOverlayOrigin(e.currentTarget)
                      openNewGoal({
                        name: idea.label,
                        icon: idea.suggestedIcon,
                        motivation: idea.reason,
                      })
                    }}
                    className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)] hover:bg-accent/60 hover:text-foreground"
                  >
                    {idea.suggestedIcon} {idea.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {SETUP_PROMPTS.slice(1).map((q) => (
              <button
                key={q}
                type="button"
                onClick={(e) => {
                  captureOverlayOrigin(e.currentTarget)
                  openChat(q, { autoSend: true, mode: 'full' })
                }}
                className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)] hover:bg-accent/60 hover:text-foreground"
              >
                Emergency buffer?
              </button>
            ))}
          </div>
        </section>
      )}

      {tab === 'goals' && !isGoalsSetup && (
        <>
          <HeroCard tone="iris" className="w-full min-h-[8.25rem]">
            <div className="flex w-full items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/85">Saved toward goals</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  <HiddenAmount>{formatMoney(totalSaved, wallet.base_currency)}</HiddenAmount>
                </p>
                <p className="mt-1.5 text-sm text-white/80">
                  of <HiddenAmount>{formatMoney(totalTarget, wallet.base_currency)}</HiddenAmount>
                  {' · '}
                  {goals.length} goal{goals.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="relative grid size-[4.5rem] shrink-0 place-items-center">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `conic-gradient(white ${overallPct}%, color-mix(in srgb, white 25%, transparent) 0)`,
                    WebkitMaskImage:
                      'radial-gradient(circle closest-side, transparent 70%, black 71%)',
                    maskImage: 'radial-gradient(circle closest-side, transparent 70%, black 71%)',
                  }}
                />
                <span className="relative text-base font-bold tabular-nums">{overallPct}%</span>
              </div>
            </div>
          </HeroCard>

          {insight && (
            <AiInsight featured tone={insight.tone} askText={insight.text}>
              {insight.text}
            </AiInsight>
          )}

          <button
            type="button"
            onClick={(e) => {
              captureOverlayOrigin(e.currentTarget)
              openChat('Help me save more this month toward my goals.', {
                autoSend: true,
                mode: 'full',
              })
            }}
            className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)] hover:bg-accent/60 hover:text-foreground self-start"
          >
            Help me save more this month
          </button>

          {milestoneIdeas.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Ideas for you</p>
              <div className="flex flex-wrap gap-2">
                {milestoneIdeas.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    onClick={(e) => {
                      captureOverlayOrigin(e.currentTarget)
                      openNewGoal({
                        name: idea.label,
                        icon: idea.suggestedIcon,
                        motivation: idea.reason,
                      })
                    }}
                    className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)] hover:bg-accent/60 hover:text-foreground"
                  >
                    {idea.suggestedIcon} {idea.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Your goals"
              actionLabel="+ Add"
              onAction={() => openNewGoal(null)}
            />
            {goals.map((goal, i) => (
              <GoalCardWithContributions
                key={goal.id}
                goal={goal}
                currency={wallet.base_currency}
                onSelect={() => navigate(`/goals/${goal.id}`)}
                onAddFunds={() => setContributingGoal(goal)}
                toneIndex={i}
              />
            ))}
          </section>

          {archivedGoals.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Archived" />
              {archivedGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="flex items-center gap-3 rounded-[1.35rem] bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {goal.icon ? `${goal.icon} ` : ''}
                      {goal.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatMoney(goal.current_amount_minor, wallet.base_currency)} of{' '}
                      {formatMoney(goal.target_amount_minor, wallet.base_currency)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-full"
                    disabled={unarchiveGoal.isPending}
                    onClick={() => handleGoalRestore(goal.id, goal.name)}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {tab === 'debts' && debtsPending && (
        <p className="text-sm text-muted-foreground">Loading your debts…</p>
      )}

      {tab === 'debts' && isDebtsSetup && (
        <section className="flex flex-col gap-4">
          <TipNote>
            Track a loan or IOU in either direction. Logging payments keeps the balance honest.
          </TipNote>
          <button
            type="button"
            onClick={(e) => {
              captureOverlayOrigin(e.currentTarget)
              setEditingDebt(null)
              setDebtFormOpen(true)
            }}
            className={cn(
              'flex items-center gap-3 rounded-[1.5rem] bg-card p-4 text-left shadow-[var(--shadow-soft)] transition-transform active:scale-[0.99]',
              cardAccentClass('rose'),
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--rose-soft)] text-[var(--rose)]">
              <Plus className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Add a debt</p>
              <p className="text-sm text-muted-foreground">Something you owe, or something owed to you</p>
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => {
              captureOverlayOrigin(e.currentTarget)
              openChat('Help me track a debt or IOU.', { autoSend: true, mode: 'full' })
            }}
            className={cn(
              'flex items-center gap-3 rounded-[1.5rem] bg-card p-4 text-left shadow-[var(--shadow-soft)] transition-transform active:scale-[0.99]',
              cardAccentClass('iris'),
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--iris-soft)] text-[var(--iris)]">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Tell Penda about it</p>
              <p className="text-sm text-muted-foreground">Describe it in chat and I’ll set it up</p>
            </div>
          </button>
        </section>
      )}

      {tab === 'debts' && !isDebtsSetup && (
        <>
          <HeroCard tone={oweTotal > 0 ? 'rose' : 'iris'} className="w-full min-h-[8.25rem]">
            <div className="flex w-full flex-col gap-3">
              <p className="text-sm font-medium text-white/85">Debt snapshot</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-white/75">You owe</p>
                  <p className="mt-1 text-xl font-bold tabular-nums tracking-tight">
                    <HiddenAmount>{formatMoney(oweTotal, wallet.base_currency)}</HiddenAmount>
                  </p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-xs text-white/75">Owed to you</p>
                  <p className="mt-1 text-xl font-bold tabular-nums tracking-tight">
                    <HiddenAmount>{formatMoney(owedTotal, wallet.base_currency)}</HiddenAmount>
                  </p>
                </div>
              </div>
            </div>
          </HeroCard>

          {insight && (
            <AiInsight featured tone={insight.tone} askText={insight.text}>
              {insight.text}
            </AiInsight>
          )}

          <button
            type="button"
            onClick={(e) => {
              captureOverlayOrigin(e.currentTarget)
              openChat('What debt should I attack first?', { autoSend: true, mode: 'full' })
            }}
            className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)] hover:bg-accent/60 hover:text-foreground self-start"
          >
            What should I attack first?
          </button>

          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Your debts"
              actionLabel="+ Add"
              onAction={() => {
                setEditingDebt(null)
                setDebtFormOpen(true)
              }}
            />

            <div className="flex items-center gap-2">
              <div className="-mx-4 flex flex-1 gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
                {(
                  [
                    { value: 'outstanding', label: 'Outstanding' },
                    { value: 'cleared', label: 'Cleared' },
                    { value: 'all', label: 'All' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDebtFilter(opt.value)}
                    className={cn(
                      'shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors',
                      debtFilter === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border/70 bg-card text-muted-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <Popover open={debtSortMenuOpen} onOpenChange={setDebtSortMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Sort debts"
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-border/70 bg-card text-muted-foreground"
                  >
                    <ArrowUpDown className="size-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-44 p-2">
                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Sort by</p>
                  <div className="flex flex-col gap-0.5">
                    {(
                      [
                        { value: 'dueDate', label: 'Due date' },
                        { value: 'amount', label: 'Amount' },
                        { value: 'name', label: 'Name' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setDebtSort(opt.value)
                          setDebtSortMenuOpen(false)
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span>{opt.label}</span>
                        {debtSort === opt.value && <Check className="size-4 shrink-0 text-primary" />}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {filteredDebts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {debtFilter === 'outstanding' ? 'No outstanding debts. Nice and clear.' : 'No cleared debts yet.'}
              </p>
            ) : (
              filteredDebts.map((debt) => (
                <DebtProgressCard
                  key={debt.id}
                  debt={debt}
                  currency={wallet.base_currency}
                  onSelect={() => {
                    setEditingDebt(debt)
                    setDebtFormOpen(true)
                  }}
                  onLogPayment={() => setPayingDebt(debt)}
                />
              ))
            )}
          </section>

          {archivedDebts.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionHeader title="Archived" />
              {archivedDebts.map((debt) => (
                <div
                  key={debt.id}
                  className="flex items-center gap-3 rounded-[1.35rem] bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{debt.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {debt.direction === 'i_owe' ? 'You owed' : 'Owed to you'}
                      {debt.counterparty ? ` · ${debt.counterparty}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-full"
                    disabled={unarchiveDebt.isPending}
                    onClick={() => handleDebtRestore(debt.id, debt.name)}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {((tab === 'goals' && !isGoalsSetup) || (tab === 'debts' && !isDebtsSetup)) && (
        <Button
          onClick={(e) => {
            captureOverlayOrigin(e.currentTarget)
            if (tab === 'goals') {
              openNewGoal(null)
            } else {
              setEditingDebt(null)
              setDebtFormOpen(true)
            }
          }}
          size="icon"
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-6 h-14 w-14 rounded-full shadow-[var(--shadow-card)] transition-transform active:scale-95"
          aria-label={tab === 'goals' ? 'Add savings goal' : 'Add debt'}
        >
          <Plus className="size-6" />
        </Button>
      )}

      <GoalForm
        open={goalFormOpen}
        onOpenChange={(open) => {
          setGoalFormOpen(open)
          if (!open) setGoalDefaults(null)
        }}
        walletId={wallet.id}
        currency={wallet.base_currency}
        defaults={goalDefaults}
        onSubmit={handleGoalSubmit}
        isSubmitting={createGoal.isPending}
      />

      <ContributionForm
        open={!!contributingGoal}
        onOpenChange={(open) => !open && setContributingGoal(null)}
        goalName={contributingGoal?.name ?? ''}
        onSubmit={handleContribution}
        isSubmitting={addContribution.isPending}
      />

      <DebtForm
        open={debtFormOpen}
        onOpenChange={setDebtFormOpen}
        currency={wallet.base_currency}
        debt={editingDebt}
        onSubmit={handleDebtSubmit}
        onArchive={editingDebt ? handleDebtArchive : undefined}
        isSubmitting={createDebt.isPending || updateDebt.isPending}
      />

      <PaymentForm
        open={!!payingDebt}
        onOpenChange={(open) => !open && setPayingDebt(null)}
        debtName={payingDebt?.name ?? ''}
        accounts={accounts}
        onSubmit={handlePayment}
        isSubmitting={addPayment.isPending}
      />

      <BottomNav />
    </main>
  )
}
