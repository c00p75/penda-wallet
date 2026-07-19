import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HeroBlob } from '@/components/ui/hero-blob'
import { CurrencyCombobox } from '@/components/CurrencyCombobox'
import { cn } from '@/lib/utils'
import { currencySymbol } from '@/lib/currencies'
import { formatMoney } from '@/lib/money'
import { useAuthStore } from '@/store/authStore'
import { useWalletStore } from '@/store/walletStore'
import { createMemory } from '@/features/memory/api'
import { useUpdateProfile } from '@/features/profile/hooks'
import { GOAL_OPTIONS, type PrimaryGoal } from '@/features/profile/onboardingOptions'
import { buildOnboardingMemories } from '@/features/profile/onboarding'
import {
  clearWalkthrough,
  finalizeWalkthroughChecklist,
  isWalkthroughActive,
  loadWalkthrough,
  saveWalkthrough,
  type WalkthroughState,
} from '@/features/onboarding/gettingStarted'
import { useOnboardingStore } from '@/features/onboarding/onboardingStore'
import { seedWalletFromOnboarding } from '@/features/onboarding/seedWallet'
import { useChatStore } from '@/features/chat/chatStore'
import { useBudgets } from '@/features/budgets/hooks'
import { useCategories } from '@/features/categories/hooks'
import { useLatestReconciliation } from '@/features/reconciliation/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { useCreateWallet, useCurrentWallet } from './hooks'

const STEPS = ['wallet', 'goal', 'log', 'balance', 'plan'] as const
type Step = (typeof STEPS)[number]
type ChatStep = 'log' | 'balance' | 'plan'

function StepHeading({ bold, light }: { bold: string; light: string }) {
  return (
    <h1 className="text-center text-[2rem] leading-[1.1] tracking-tight text-foreground">
      <span className="font-bold">{bold}</span>
      <br />
      <span className="font-light">{light}</span>
    </h1>
  )
}

function stepIndexFor(step: Step) {
  return STEPS.indexOf(step)
}

function isChatStep(step: Step): step is ChatStep {
  return step === 'log' || step === 'balance' || step === 'plan'
}

export function OnboardingScreen() {
  const userId = useAuthStore((s) => s.session?.user.id)
  const createWallet = useCreateWallet()
  const updateProfile = useUpdateProfile(userId)
  const setCurrentWalletId = useWalletStore((s) => s.setCurrentWalletId)
  const openChat = useChatStore((s) => s.openChat)
  const chatOpen = useChatStore((s) => s.open)
  const setChatOpen = useChatStore((s) => s.setOpen)
  const setWalkthroughActive = useOnboardingStore((s) => s.setWalkthroughActive)
  const { data: currentWallet } = useCurrentWallet()

  const [stepIndex, setStepIndex] = useState(0)
  const step: Step = STEPS[stepIndex]

  const [name, setName] = useState('My Wallet')
  const [currency, setCurrency] = useState('USD')
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(null)
  const [walletId, setWalletId] = useState<string | null>(null)
  const [walkthrough, setWalkthrough] = useState<WalkthroughState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resumed, setResumed] = useState(false)
  /** User opened balance chat at least once this step. */
  const [balanceChatOpened, setBalanceChatOpened] = useState(false)
  /** User returned from balance chat (closed sheet after opening). */
  const [balanceChatReturned, setBalanceChatReturned] = useState(false)

  const openedChatForStepRef = useRef<ChatStep | null>(null)
  const autoAdvancedRef = useRef<string | null>(null)

  const activeWalletId = walletId ?? currentWallet?.id
  const { data: transactions = [] } = useTransactions(activeWalletId)
  const { data: budgets = [] } = useBudgets(activeWalletId)
  const { data: categories = [] } = useCategories(activeWalletId)
  const { data: latestReconciliation } = useLatestReconciliation(activeWalletId, userId)
  const sym = currencySymbol(currency)
  const hasLogged = transactions.length > 0
  const hasBalanceSet = !!latestReconciliation || (balanceChatOpened && balanceChatReturned)

  const budgetPreview = budgets.slice(0, 4).map((b) => {
    const cat = categories.find((c) => c.id === b.category_id)
    return {
      id: b.id,
      label: cat?.name ?? 'Budget',
      icon: cat?.icon ?? '💰',
      amount: b.amount_minor,
    }
  })

  function buildPlanChatSeed() {
    if (budgetPreview.length === 0) {
      return 'I drafted a starter plan for you on the Plan tab. Reply "looks good" or tell me what to tweak.'
    }
    return `I drafted your starter plan: ${budgetPreview
      .map((b) => `${b.label} ${formatMoney(b.amount, currency)}`)
      .join(', ')}. Reply "looks good" or tell me what to tweak.`
  }

  // Resume interactive walkthrough after refresh / remount once a wallet exists.
  useEffect(() => {
    if (resumed || !currentWallet) return
    if (!isWalkthroughActive(currentWallet.id)) return
    const saved = loadWalkthrough(currentWallet.id)
    if (!saved || saved.phase === 'done') return
    setWalletId(currentWallet.id)
    setCurrency(currentWallet.base_currency)
    setWalkthrough(saved)
    setStepIndex(stepIndexFor(saved.phase))
    setWalkthroughActive(true)
    setResumed(true)
  }, [currentWallet, resumed, setWalkthroughActive])

  // Chat-first: open Penda as soon as each interactive step starts.
  useEffect(() => {
    if (!isChatStep(step) || !activeWalletId) return
    if (openedChatForStepRef.current === step) return

    // Wait a beat for AmbientChat to mount; for plan, prefer budgets to be loaded.
    const delay = step === 'plan' && budgets.length === 0 ? 900 : 400
    const timer = window.setTimeout(() => {
      if (openedChatForStepRef.current === step) return
      openedChatForStepRef.current = step
      if (step === 'log') {
        openChat(`I spent ${sym}`, { mode: 'quick' })
      } else if (step === 'balance') {
        setBalanceChatOpened(true)
        openChat(`My balance is ${sym}`, { mode: 'full' })
      } else {
        openChat(buildPlanChatSeed(), { autoSend: true, mode: 'full' })
      }
    }, delay)

    return () => window.clearTimeout(timer)
    // buildPlanChatSeed reads latest budgets/categories via closure when timer fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, activeWalletId, openChat, sym, budgets.length])

  // When user closes balance chat after opening it, treat as engaged enough to continue.
  useEffect(() => {
    if (step !== 'balance' || chatOpen || !balanceChatOpened) return
    setBalanceChatReturned(true)
  }, [step, chatOpen, balanceChatOpened])

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0))
  }

  function persistWalkthrough(next: WalkthroughState) {
    if (!activeWalletId) return
    setWalkthrough(next)
    saveWalkthrough(activeWalletId, next)
  }

  function advanceTo(phase: WalkthroughState['phase'], patch: Partial<WalkthroughState> = {}) {
    const base = walkthrough ?? { phase: 'log' as const, skippedLog: false, skippedBalance: false }
    const next = { ...base, ...patch, phase }
    persistWalkthrough(next)
    setChatOpen(false)
    if (phase === 'done') {
      finishToHome(next)
      return
    }
    openedChatForStepRef.current = null
    if (phase === 'balance') {
      setBalanceChatOpened(false)
      setBalanceChatReturned(false)
    }
    setStepIndex(stepIndexFor(phase))
  }

  function finishToHome(state: WalkthroughState) {
    if (!activeWalletId) return
    finalizeWalkthroughChecklist(activeWalletId, {
      skippedLog: state.skippedLog,
      skippedBalance: state.skippedBalance,
      hasTransactions: transactions.length > 0,
    })
    clearWalkthrough(activeWalletId)
    setWalkthrough({ ...state, phase: 'done' })
    setWalkthroughActive(false)
    setChatOpen(false)
  }

  // Auto-advance when chat outcomes land.
  useEffect(() => {
    if (step === 'log' && hasLogged) {
      const key = 'log-done'
      if (autoAdvancedRef.current === key) return
      autoAdvancedRef.current = key
      const t = window.setTimeout(() => advanceTo('balance', { skippedLog: false }), 700)
      return () => window.clearTimeout(t)
    }
    if (step === 'balance' && !!latestReconciliation) {
      const key = 'balance-done'
      if (autoAdvancedRef.current === key) return
      autoAdvancedRef.current = key
      const t = window.setTimeout(() => advanceTo('plan', { skippedBalance: false }), 700)
      return () => window.clearTimeout(t)
    }
    return undefined
    // advanceTo closes over latest walkthrough; intentional for step transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hasLogged, latestReconciliation])

  async function provisionWalletAndStartWalkthrough() {
    if (!userId) return
    setSubmitting(true)
    try {
      const wallet = await createWallet.mutateAsync({
        name: name.trim() || 'My Wallet',
        baseCurrency: currency,
      })

      await updateProfile.mutateAsync({
        mode: 'individual',
        household_size: null,
        primary_goal: primaryGoal,
        income_range: null,
        gender: 'prefer_not_to_say',
        notification_opt_in: false,
      })

      try {
        const memories = buildOnboardingMemories(
          {
            mode: 'individual',
            householdSize: null,
            primaryGoal,
            incomeRange: null,
            gender: 'prefer_not_to_say',
          },
          wallet.id,
        )
        await Promise.all(memories.map((m) => createMemory(userId, m)))
      } catch {
        // Best-effort enrichment.
      }

      try {
        await seedWalletFromOnboarding({
          walletId: wallet.id,
          userId,
          primaryGoal,
          incomeRange: null,
        })
      } catch {
        // Starter plan is optional.
      }

      const next: WalkthroughState = {
        phase: 'log',
        skippedLog: false,
        skippedBalance: false,
      }
      saveWalkthrough(wallet.id, next)
      setWalkthrough(next)
      setWalletId(wallet.id)
      setCurrentWalletId(wallet.id)
      setWalkthroughActive(true)
      openedChatForStepRef.current = null
      autoAdvancedRef.current = null
      setStepIndex(stepIndexFor('log'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not finish setting up your wallet.')
    } finally {
      setSubmitting(false)
    }
  }

  function reopenChat() {
    if (step === 'log') openChat(`I spent ${sym}`, { mode: 'quick' })
    else if (step === 'balance') {
      setBalanceChatOpened(true)
      openChat(`My balance is ${sym}`, { mode: 'full' })
    } else openChat(buildPlanChatSeed(), { autoSend: true, mode: 'full' })
  }

  return (
    <main className="relative mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 overflow-hidden bg-background px-4 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-20 -right-10 size-64 rounded-full opacity-70 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--iris-soft), transparent 70%)' }}
        />
        <div
          className="absolute -bottom-16 -left-12 size-56 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--apricot-soft), transparent 70%)' }}
        />
        <HeroBlob tone="mint" className="absolute top-8 right-4 size-24 opacity-40" />
      </div>

      <div className="relative flex flex-col items-center gap-2 text-center">
        <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)] ring-1 ring-border/50">
          Welcome to Penda
        </span>
        <div className="flex gap-1.5">
          {STEPS.map((s) => (
            <span
              key={s}
              className={cn('h-1.5 w-6 rounded-full transition-colors', s === step ? 'bg-primary' : 'bg-muted')}
            />
          ))}
        </div>
      </div>

      {step === 'wallet' && (
        <div className="relative flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/50">
          <div className="flex flex-col items-center gap-2 text-center">
            <StepHeading bold="Set up" light="your wallet" />
            <p className="text-sm text-muted-foreground">
              Pick a currency. You can rename this wallet anytime in Settings.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-wallet-name">Wallet name</Label>
            <Input
              id="onboarding-wallet-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Wallet"
              className="rounded-2xl"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onboarding-currency">Currency</Label>
            <CurrencyCombobox id="onboarding-currency" value={currency} onChange={setCurrency} />
          </div>
          <Button onClick={goNext} disabled={!name.trim()} className="rounded-full">
            Next
          </Button>
        </div>
      )}

      {step === 'goal' && (
        <div className="relative flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/50">
          <div className="flex flex-col items-center gap-2 text-center">
            <StepHeading bold="What matters" light="most right now?" />
            <p className="text-sm text-muted-foreground">
              Optional. Helps Penda seed a starting plan for you.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {GOAL_OPTIONS.map((g) => {
              const active = primaryGoal === g.value
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setPrimaryGoal(active ? null : g.value)}
                  aria-pressed={active}
                  className={cn(
                    'flex flex-col gap-0.5 rounded-2xl border p-3 text-left transition-colors',
                    active ? 'border-primary bg-[var(--iris-soft)]' : 'border-border/60 bg-background',
                  )}
                >
                  <span className="text-sm font-medium">{g.label}</span>
                  <span className="text-xs text-muted-foreground">{g.description}</span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={goBack} className="flex-1 rounded-full" disabled={submitting}>
              Back
            </Button>
            <Button
              onClick={provisionWalletAndStartWalkthrough}
              className="flex-1 rounded-full"
              disabled={submitting}
            >
              {submitting ? 'Setting up…' : 'Continue'}
            </Button>
          </div>
        </div>
      )}

      {step === 'log' && (
        <div className="relative flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/50">
          <div className="flex flex-col items-center gap-2 text-center">
            <StepHeading bold="Log your" light="first purchase" />
            <p className="text-sm text-muted-foreground">
              Chat with Penda, type or talk. We&apos;ll move on when it&apos;s logged.
            </p>
          </div>
          {hasLogged ? (
            <p className="rounded-2xl bg-[var(--mint-soft)]/50 px-3 py-2 text-center text-sm font-medium text-[var(--mint)]">
              Nice, first purchase logged.
            </p>
          ) : (
            <Button className="rounded-full" onClick={reopenChat}>
              {chatOpen ? 'Keep chatting' : 'Open chat with Penda'}
            </Button>
          )}
          {hasLogged ? (
            <Button className="rounded-full" onClick={() => advanceTo('balance', { skippedLog: false })}>
              Continue
            </Button>
          ) : (
            <button
              type="button"
              className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => advanceTo('balance', { skippedLog: true })}
            >
              I&apos;ll do this later
            </button>
          )}
        </div>
      )}

      {step === 'balance' && (
        <div className="relative flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/50">
          <div className="flex flex-col items-center gap-2 text-center">
            <StepHeading bold="What do you" light="actually have?" />
            <p className="text-sm text-muted-foreground">
              Tell Penda your balance in chat so the numbers stay honest.
            </p>
          </div>
          {hasBalanceSet ? (
            <p className="rounded-2xl bg-[var(--mint-soft)]/50 px-3 py-2 text-center text-sm font-medium text-[var(--mint)]">
              {latestReconciliation ? 'Balance saved.' : 'Thanks, you can continue.'}
            </p>
          ) : (
            <Button className="rounded-full" onClick={reopenChat}>
              {chatOpen ? 'Keep chatting' : 'Open chat with Penda'}
            </Button>
          )}
          {hasBalanceSet ? (
            <Button className="rounded-full" onClick={() => advanceTo('plan', { skippedBalance: false })}>
              Continue
            </Button>
          ) : (
            <button
              type="button"
              className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => advanceTo('plan', { skippedBalance: true })}
            >
              Skip for now
            </button>
          )}
        </div>
      )}

      {step === 'plan' && (
        <div className="relative flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/50">
          <div className="flex flex-col items-center gap-2 text-center">
            <StepHeading bold="Your starter" light="plan" />
            <p className="text-sm text-muted-foreground">
              Penda just messaged you the draft. Reply in chat, or finish when it looks right.
            </p>
          </div>
          {budgetPreview.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {budgetPreview.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    <span aria-hidden>{b.icon}</span>
                    <span className="truncate font-medium">{b.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatMoney(b.amount, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button className="rounded-full" variant="outline" onClick={reopenChat}>
            {chatOpen ? 'Keep chatting' : 'Talk to Penda about it'}
          </Button>
          <Button
            className="rounded-full"
            onClick={() =>
              advanceTo('done', {
                skippedLog: walkthrough?.skippedLog ?? !hasLogged,
                skippedBalance: walkthrough?.skippedBalance ?? !hasBalanceSet,
              })
            }
          >
            Looks good
          </Button>
        </div>
      )}
    </main>
  )
}
