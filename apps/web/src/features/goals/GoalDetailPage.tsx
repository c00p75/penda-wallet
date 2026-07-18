import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ChatCircle, Sparkle } from '@/components/icons/product'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useCategories } from '@/features/categories/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { usePacts, useCreatePact, useDeletePact } from '@/features/pacts/hooks'
import { PactCard } from '@/features/pacts/PactCard'
import { PactForm } from '@/features/pacts/PactForm'
import type { CommitmentPactInput } from '@/features/pacts/types'
import { useChatStore } from '@/features/chat/chatStore'
import { useAddContribution, useContributions, useSavingsGoals, useUpdateSavingsGoal, useDeleteSavingsGoal } from './hooks'
import { getGoalImageUrl } from './api'
import { GoalForm } from './GoalForm'
import { ContributionForm } from './ContributionForm'
import { monthlyContributionMinor } from './dreamBuilder'
import { estimateGoalCompletion } from './forecast'
import type { SavingsGoalInput } from './types'

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function GoalDetailPage() {
  const session = useAuthStore((s) => s.session)
  const navigate = useNavigate()
  const openChat = useChatStore((s) => s.openChat)
  const { id } = useParams<{ id: string }>()
  const { data: wallet } = useCurrentWallet()

  const { data: goals = [], isLoading: goalsLoading } = useSavingsGoals(wallet?.id)
  const goal = goals.find((g) => g.id === id) ?? null

  const { data: contributions = [] } = useContributions(goal?.id)
  const { data: categories = [] } = useCategories(wallet?.id)
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: pacts = [] } = usePacts(wallet?.id)

  const updateGoal = useUpdateSavingsGoal(wallet?.id)
  const deleteGoal = useDeleteSavingsGoal(wallet?.id)
  const addContribution = useAddContribution(wallet?.id, goal?.id)
  const createPact = useCreatePact(wallet?.id)
  const deletePact = useDeletePact(wallet?.id)

  const [contributionOpen, setContributionOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [pactFormOpen, setPactFormOpen] = useState(false)

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null
  if (!goal) return goalsLoading ? null : <Navigate to="/goals" replace />

  const currency = wallet.base_currency
  const goalPacts = pacts.filter((p) => p.goal_id === goal.id)

  async function handleContribution(amountMinor: number, date: string) {
    try {
      await addContribution.mutateAsync({ amountMinor, date })
      toast(amountMinor >= 0 ? 'Funds added.' : 'Withdrawal logged.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleGoalSubmit(input: SavingsGoalInput) {
    try {
      await updateGoal.mutateAsync({ id: goal!.id, input })
      toast('Goal updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleGoalDelete() {
    try {
      await deleteGoal.mutateAsync(goal!.id)
      toast('Goal deleted.')
      navigate('/goals', { replace: true })
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

  async function handlePactDelete(pactId: string) {
    try {
      await deletePact.mutateAsync(pactId)
      toast('Pact removed.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  const pct = goal.target_amount_minor > 0 ? goal.current_amount_minor / goal.target_amount_minor : 0
  const reached = pct >= 1
  const ringPct = Math.round(Math.min(pct, 1) * 100)
  const accent = reached ? 'var(--mint)' : 'var(--apricot)'

  const perMonth = monthlyContributionMinor(goal.target_amount_minor, goal.current_amount_minor, goal.target_date)
  const forecast = estimateGoalCompletion(goal, contributions)
  const recentContributions = [...contributions]
    .sort((a, b) => b.contributed_date.localeCompare(a.contributed_date) || b.created_at.localeCompare(a.created_at))
    .slice(0, 12)

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader
        size="compact"
        title={
          <span className="flex min-w-0 items-center gap-1.5">
            {goal.icon && <span aria-hidden>{goal.icon}</span>}
            <span className="truncate">{goal.name}</span>
          </span>
        }
        trailing={
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 rounded-2xl"
            aria-label="Ask about this goal"
            onClick={() => openChat(`About my "${goal.name}" goal: `)}
          >
            <ChatCircle className="size-5" weight="duotone" />
          </Button>
        }
      />

      <div
        className="relative flex flex-col items-center gap-3 overflow-hidden rounded-[1.75rem] p-6 shadow-[var(--shadow-card)]"
        style={
          goal.image_path
            ? undefined
            : {
                background: `linear-gradient(145deg, color-mix(in srgb, ${accent} 18%, var(--card)), var(--card))`,
              }
        }
      >
        {goal.image_path && (
          <>
            <img
              src={getGoalImageUrl(goal.image_path)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-black/45" />
          </>
        )}

        <div
          className="relative grid size-40 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${accent} ${ringPct}%, color-mix(in srgb, ${accent} 16%, transparent) 0)` }}
        >
          <div className="grid size-32 place-items-center rounded-full bg-card shadow-[var(--shadow-soft)]">
            <div className="flex flex-col items-center">
              <span className="text-4xl font-bold tabular-nums" style={{ color: accent }}>
                {ringPct}%
              </span>
              <span className="text-[11px] font-semibold tracking-widest text-muted-foreground">PROGRESS</span>
            </div>
          </div>
        </div>
        <p className={cn('relative text-sm font-medium tabular-nums', goal.image_path ? 'text-white' : 'text-muted-foreground')}>
          {formatMoney(goal.current_amount_minor, currency)} of {formatMoney(goal.target_amount_minor, currency)}
        </p>
      </div>

      <div className="flex w-full flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--iris)' }}>
          <Sparkle className="size-3.5" weight="fill" />
          AI Projection
        </div>
        <h1 className="text-2xl font-semibold">Will I make it?</h1>
        <p className="w-full text-sm leading-relaxed text-muted-foreground">
          Your <span className="font-semibold text-foreground">{goal.name}</span> goal of{' '}
          <span className="font-semibold text-foreground">{formatMoney(goal.target_amount_minor, currency)}</span>{' '}
          is {ringPct}% funded.{' '}
          {reached ? (
            'You\'ve already hit it, nice work.'
          ) : perMonth !== null && perMonth > 0 ? (
            <>
              To reach it by {formatDate(goal.target_date!)}, Penda suggests saving{' '}
              <span className="font-semibold text-foreground">{formatMoney(perMonth, currency)}/month</span>.
            </>
          ) : forecast.kind === 'projected' ? (
            <>At your current pace, you're on track to finish by {formatDate(forecast.projectedDate!)}.</>
          ) : forecast.kind === 'not-saving' ? (
            'You haven\'t added to it recently, a small monthly amount would get it moving.'
          ) : (
            'Add a few contributions and I\'ll start projecting your pace.'
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-1 gap-1.5"
          onClick={() =>
            openChat(`About my "${goal.name}" goal at ${ringPct}%: what should I do next?`, { autoSend: true })
          }
        >
          <ChatCircle className="size-3.5" weight="duotone" />
          Ask about this goal
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Button size="lg" className="w-full" onClick={() => setContributionOpen(true)}>
          Commit Funds
        </Button>
        <Button size="lg" variant="outline" className="w-full" onClick={() => setEditOpen(true)}>
          Adjust Goal
        </Button>
      </div>

      {recentContributions.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Contribution history</h2>
          <ul className="flex flex-col gap-1">
            {recentContributions.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-sm tabular-nums"
              >
                <span className="text-muted-foreground">{formatDate(c.contributed_date)}</span>
                <span className={c.amount_minor >= 0 ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium'}>
                  {c.amount_minor >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(c.amount_minor), currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Commitment Pacts</h2>
          <p className="text-xs text-muted-foreground">Automated discipline for this goal.</p>
        </div>

        {goalPacts.length > 0 && (
          <div className="flex flex-col gap-2">
            {goalPacts.map((pact) => (
              <PactCard
                key={pact.id}
                pact={pact}
                transactions={transactions}
                category={categories.find((c) => c.id === pact.category_id) ?? null}
                currency={currency}
                onDelete={() => handlePactDelete(pact.id)}
              />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setPactFormOpen(true)}
          className="flex flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-border py-6 text-center text-muted-foreground hover:bg-muted/40"
        >
          <span className="grid size-9 place-items-center rounded-full border">
            <Plus className="size-4" />
          </span>
          <span className="text-sm font-medium text-foreground">New Pact</span>
          <span className="text-xs">Pick a category to avoid for a while.</span>
        </button>
      </section>

      <ContributionForm
        open={contributionOpen}
        onOpenChange={setContributionOpen}
        goalName={goal.name}
        onSubmit={handleContribution}
        isSubmitting={addContribution.isPending}
      />

      <GoalForm
        open={editOpen}
        onOpenChange={setEditOpen}
        walletId={wallet.id}
        currency={currency}
        goal={goal}
        onSubmit={handleGoalSubmit}
        onDelete={handleGoalDelete}
        isSubmitting={updateGoal.isPending}
      />

      <PactForm
        open={pactFormOpen}
        onOpenChange={setPactFormOpen}
        categories={categories}
        goalId={goal.id}
        goalName={goal.name}
        onSubmit={handlePactSubmit}
        isSubmitting={createPact.isPending}
      />

      <BottomNav />
    </main>
  )
}
