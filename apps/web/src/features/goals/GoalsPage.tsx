import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { AiInsight } from '@/components/AiInsight'
import { formatMoney } from '@/lib/money'
import { captureOverlayOrigin } from '@/lib/overlayOrigin'
import { useChatStore } from '@/features/chat/chatStore'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useAddContribution, useContributions, useCreateSavingsGoal, useSavingsGoals } from './hooks'
import { GoalForm } from './GoalForm'
import { ContributionForm } from './ContributionForm'
import { GoalProgressCard } from './GoalProgressCard'
import type { SavingsGoal, SavingsGoalInput } from './types'
import { useAddPayment, useCreateDebt, useDebts, useDeleteDebt, useUpdateDebt } from '@/features/debts/hooks'
import { DebtForm } from '@/features/debts/DebtForm'
import { PaymentForm } from '@/features/debts/PaymentForm'
import { DebtProgressCard } from '@/features/debts/DebtProgressCard'
import type { Debt, DebtInput } from '@/features/debts/types'

const GOAL_TONES = ['apricot', 'iris', 'sun', 'mint', 'rose'] as const

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

  const { data: goals = [] } = useSavingsGoals(wallet?.id)
  const createGoal = useCreateSavingsGoal(wallet?.id)

  const { data: debts = [] } = useDebts(wallet?.id)
  const createDebt = useCreateDebt(wallet?.id)
  const updateDebt = useUpdateDebt(wallet?.id)
  const deleteDebt = useDeleteDebt(wallet?.id)

  const [tab, setTab] = useState<'goals' | 'debts'>('goals')
  const [goalFormOpen, setGoalFormOpen] = useState(false)
  const [contributingGoal, setContributingGoal] = useState<SavingsGoal | null>(null)
  const [debtFormOpen, setDebtFormOpen] = useState(false)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null)

  const addContribution = useAddContribution(wallet?.id, contributingGoal?.id)
  const addPayment = useAddPayment(wallet?.id, payingDebt?.id)

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

  async function handleDebtDelete() {
    if (!editingDebt) return
    try {
      await deleteDebt.mutateAsync(editingDebt.id)
      toast('Debt deleted.')
      setDebtFormOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handlePayment(amountMinor: number, date: string) {
    try {
      await addPayment.mutateAsync({ amountMinor, date })
      toast('Payment logged.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  // AI speaks first: a real read of savings pace or debt balances, tab-aware.
  const insight: { tone: 'default' | 'warm' | 'attention'; text: string } | null =
    tab === 'goals'
      ? goals.length === 0
        ? null
        : (() => {
            const reached = goals.find(
              (g) => g.target_amount_minor > 0 && g.current_amount_minor >= g.target_amount_minor,
            )
            if (reached)
              return { tone: 'warm', text: `You hit ${reached.name} 🎉, ready to set the next one?` }
            const nearest = goals
              .filter((g) => g.target_amount_minor > 0)
              .map((g) => ({ name: g.name, pct: g.current_amount_minor / g.target_amount_minor }))
              .sort((a, b) => b.pct - a.pct)[0]
            if (!nearest) return null
            return {
              tone: 'warm',
              text: `You’re ${Math.round(nearest.pct * 100)}% of the way to ${nearest.name}. Keep going.`,
            }
          })()
      : debts.length === 0
        ? null
        : (() => {
            const owe = debts
              .filter((d) => d.direction === 'i_owe')
              .reduce((s, d) => s + d.balance_minor, 0)
            const owed = debts
              .filter((d) => d.direction === 'owed_to_me')
              .reduce((s, d) => s + d.balance_minor, 0)
            if (owe > 0)
              return {
                tone: 'default',
                text: `You’re paying down ${formatMoney(owe, wallet.base_currency)} across your debts. One payment at a time.`,
              }
            return {
              tone: 'default',
              text: `${formatMoney(owed, wallet.base_currency)} is owed to you. I’ll help you keep track.`,
            }
          })()

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24">
      <AppHeader />

      <section>
        <h1 className="text-[2rem] font-bold tracking-tight leading-tight">
          {tab === 'goals' ? 'Goals' : 'Debts'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tab === 'goals' ? 'Save toward what matters' : 'Pay down what you owe'}
        </p>
      </section>

      {insight && (
        <AiInsight featured tone={insight.tone} askText={insight.text}>
          {insight.text}
        </AiInsight>
      )}

      <div className="flex flex-wrap gap-2">
        {['Am I on track for my goals?', 'Help me save more this month', 'What debt should I attack first?'].map(
          (q) => (
            <button
              key={q}
              type="button"
              onClick={() => openChat(q, { autoSend: true })}
              className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)] hover:bg-accent/60 hover:text-foreground"
            >
              {q}
            </button>
          ),
        )}
      </div>

      <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as typeof tab)} className="w-full">
        <ToggleGroupItem value="goals" className="flex-1 rounded-full">
          Savings
        </ToggleGroupItem>
        <ToggleGroupItem value="debts" className="flex-1 rounded-full">
          Debts
        </ToggleGroupItem>
      </ToggleGroup>

      {tab === 'goals' ? (
        goals.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-16 text-center text-muted-foreground">
            <p className="font-medium text-foreground">No savings goals yet</p>
            <p className="text-sm">Tap + to start saving toward something.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
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
          </div>
        )
      ) : debts.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-16 text-center text-muted-foreground">
          <p className="font-medium">No debts tracked</p>
          <p className="text-sm">Tap + to track a loan or an IOU either direction.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {debts.map((debt) => (
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
          ))}
        </div>
      )}

      <Button
        onClick={(e) => {
          captureOverlayOrigin(e.currentTarget)
          if (tab === 'goals') {
            setGoalFormOpen(true)
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

      <GoalForm
        open={goalFormOpen}
        onOpenChange={setGoalFormOpen}
        walletId={wallet.id}
        currency={wallet.base_currency}
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
        onDelete={editingDebt ? handleDebtDelete : undefined}
        isSubmitting={createDebt.isPending || updateDebt.isPending}
      />

      <PaymentForm
        open={!!payingDebt}
        onOpenChange={(open) => !open && setPayingDebt(null)}
        debtName={payingDebt?.name ?? ''}
        onSubmit={handlePayment}
        isSubmitting={addPayment.isPending}
      />

      <BottomNav />
    </main>
  )
}
