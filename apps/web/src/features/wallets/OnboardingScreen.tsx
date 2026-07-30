import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyCombobox } from '@/components/CurrencyCombobox'
import { cn } from '@/lib/utils'
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
import { buildBalanceOpener, buildLogOpener } from '@/features/onboarding/walkthroughChat'
import { useChatStore } from '@/features/chat/chatStore'
import { useLatestReconciliation } from '@/features/reconciliation/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { useProfile } from '@/features/profile/hooks'
import { personaFromGoals } from '@/features/profile/personaFromGoals'
import { resolveAiPersonality, type ActiveAiPersonality } from '@/features/profile/types'
import { AccountForm } from '@/features/accounts/AccountForm'
import { useAccounts, useCreateAccount } from '@/features/accounts/hooks'
import { useCreateWallet, useCurrentWallet } from './hooks'

const STEPS = ['wallet', 'pockets', 'goal', 'log', 'balance'] as const
type Step = (typeof STEPS)[number]
type ChatStep = 'log' | 'balance'

/** Wallet + pockets + goal are the form-based "onboarding" phase; the rest is the chat phase that follows it. */
const ONBOARDING_STEPS: readonly Step[] = ['wallet', 'pockets', 'goal']
const CHAT_PHASE_STEPS: readonly Step[] = ['log', 'balance']

/** Delay so the sheet can mount after the step card paints. */
const CHAT_OPEN_DELAY_MS = 400

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
  return step === 'log' || step === 'balance'
}

// Supabase throws raw PostgrestError objects (not Error instances), so
// `error instanceof Error` misses them, masking the real DB message behind a
// generic fallback right when it matters most for diagnosing a failure.
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string' &&
    (error as { message: string }).message
  ) {
    return (error as { message: string }).message
  }
  return 'Could not finish setting up your wallet.'
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
  const { data: profile } = useProfile(userId)

  const [stepIndex, setStepIndex] = useState(0)
  const step: Step = STEPS[stepIndex]

  const [name, setName] = useState('My Wallet')
  const [currency, setCurrency] = useState('USD')
  const [primaryGoals, setPrimaryGoals] = useState<PrimaryGoal[]>([])
  /** Resolved at provision so the log opener does not race a profile refetch. */
  const [walkthroughPersonality, setWalkthroughPersonality] = useState<ActiveAiPersonality | null>(
    null,
  )
  const [walletId, setWalletId] = useState<string | null>(null)

  const personality =
    walkthroughPersonality ?? resolveAiPersonality(profile?.ai_personality)
  /** Prefer local picks; fall back to profile so resume mid-walkthrough keeps goal copy. */
  const openerGoals = useMemo<PrimaryGoal[]>(() => {
    if (primaryGoals.length > 0) return primaryGoals
    if (profile?.primary_goals?.length) return profile.primary_goals
    if (profile?.primary_goal) return [profile.primary_goal]
    return []
  }, [primaryGoals, profile?.primary_goals, profile?.primary_goal])
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
  const { data: latestReconciliation } = useLatestReconciliation(activeWalletId, userId)
  const { data: accounts } = useAccounts(activeWalletId)
  const createAccount = useCreateAccount(activeWalletId)
  const [addPocketOpen, setAddPocketOpen] = useState(false)
  const hasLogged = transactions.length > 0

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

  // After resume (or late profile load), restore goals + persona for opener copy.
  useEffect(() => {
    if (!profile) return
    if (walkthroughPersonality == null && profile.ai_personality) {
      setWalkthroughPersonality(resolveAiPersonality(profile.ai_personality))
    }
    if (primaryGoals.length === 0) {
      const fromProfile = profile.primary_goals?.length
        ? profile.primary_goals
        : profile.primary_goal
          ? [profile.primary_goal]
          : []
      if (fromProfile.length > 0) setPrimaryGoals(fromProfile)
    }
  }, [profile, walkthroughPersonality, primaryGoals.length])

  // Chat-first: open Penda once AmbientChat can mount for this wallet.
  useEffect(() => {
    if (!isChatStep(step) || !activeWalletId) return
    if (openedChatForStepRef.current === step) return
    // AmbientChat returns null until the wallet is in the wallets query cache.
    if (!currentWallet || currentWallet.id !== activeWalletId) return
    // On resume, wait for profile so the log opener has the right persona/goals.
    if (step === 'log' && walkthroughPersonality == null && !profile) return

    // Penda speaks first each step: a local opener that sells, guides, and asks
    // for the data this step needs. The user's reply is then handled live.
    function openForStep(target: ChatStep) {
      if (openedChatForStepRef.current === target) return
      openedChatForStepRef.current = target
      if (target === 'log') {
        openChat('', {
          mode: 'full',
          assistantPortrait: personality,
          assistantSeed: buildLogOpener({
            personality,
            goals: openerGoals,
            currency,
          }),
          onboardingSkip: {
            label: "I'll do this later",
            onSkip: () => advanceTo('balance', { skippedLog: true }),
          },
        })
      } else {
        setBalanceChatOpened(true)
        openChat('', {
          mode: 'full',
          assistantSeed: buildBalanceOpener(currency),
          onboardingSkip: {
            label: 'Skip for now',
            onSkip: () => advanceTo('done', { skippedBalance: true }),
          },
        })
      }
    }

    const timer = window.setTimeout(() => openForStep(step), CHAT_OPEN_DELAY_MS)
    return () => window.clearTimeout(timer)
    // advanceTo closes over latest walkthrough; intentional, see the auto-advance effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step,
    activeWalletId,
    currentWallet?.id,
    openChat,
    personality,
    openerGoals,
    currency,
    walkthroughPersonality,
    profile,
  ])

  // When user closes balance chat after opening it, treat as engaged enough to continue.
  useEffect(() => {
    if (step !== 'balance' || chatOpen || !balanceChatOpened) return
    setBalanceChatReturned(true)
  }, [step, chatOpen, balanceChatOpened])

  function toggleGoal(value: PrimaryGoal) {
    setPrimaryGoals((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
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
    // Money-account-anchored completion: never re-run first-run for new pockets.
    void updateProfile.mutateAsync({
      onboarding_completed_at: new Date().toISOString(),
    })
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
      const t = window.setTimeout(() => advanceTo('done', { skippedBalance: false }), 700)
      return () => window.clearTimeout(t)
    }
    return undefined
    // advanceTo closes over latest walkthrough; intentional for step transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hasLogged, latestReconciliation])

  // Wallet needs to exist before the pockets step can attach accounts to it,
  // so creation happens here rather than waiting for the goal step like the
  // rest of provisioning does.
  async function createWalletAndAdvance() {
    if (!userId) return
    setSubmitting(true)
    try {
      const wallet = await createWallet.mutateAsync({
        name: name.trim() || 'My Wallet',
        baseCurrency: currency,
      })

      // Persisted from wallet creation onward (not just from 'log') so a
      // refresh mid pockets/goal step resumes here instead of the gate
      // seeing an existing money account with no active walkthrough and
      // dropping the user straight into Home. See shouldShowFirstRunOnboarding.
      const next: WalkthroughState = {
        phase: 'pockets',
        skippedLog: false,
        skippedBalance: false,
      }
      saveWalkthrough(wallet.id, next)
      setWalkthrough(next)
      setWalletId(wallet.id)
      setCurrentWalletId(wallet.id)
      setWalkthroughActive(true)
      setStepIndex(stepIndexFor('pockets'))
    } catch (error) {
      console.error('Onboarding wallet creation failed:', error)
      toast.error(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function finishGoals() {
    if (!userId || !activeWalletId) return
    setSubmitting(true)
    try {
      const personalityPick = personaFromGoals(primaryGoals)
      setWalkthroughPersonality(personalityPick)

      await updateProfile.mutateAsync({
        mode: 'individual',
        household_size: null,
        ai_personality: personalityPick,
        // Keep `primary_goal` as the top-priority pick for edge-function context.
        primary_goal: primaryGoals[0] ?? null,
        primary_goals: primaryGoals.length > 0 ? primaryGoals : null,
        income_range: null,
        gender: 'prefer_not_to_say',
        notification_opt_in: false,
      })

      try {
        const memories = buildOnboardingMemories(
          {
            mode: 'individual',
            householdSize: null,
            primaryGoals,
            incomeRange: null,
            gender: 'prefer_not_to_say',
          },
          activeWalletId,
        )
        await Promise.all(memories.map((m) => createMemory(userId, m)))
      } catch {
        // Best-effort enrichment.
      }

      persistWalkthrough({ phase: 'log', skippedLog: false, skippedBalance: false })
      openedChatForStepRef.current = null
      autoAdvancedRef.current = null
      setStepIndex(stepIndexFor('log'))
    } catch (error) {
      console.error('Onboarding persona pick failed:', error)
      toast.error(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  // Reopen with the same opener. ChatSheet dedupes on exact text / portrait, so
  // the persisted thread is restored without re-posting Penda's message.
  function reopenChat() {
    if (step === 'log') {
      openChat('', {
        mode: 'full',
        assistantPortrait: personality,
        assistantSeed: buildLogOpener({
          personality,
          goals: openerGoals,
          currency,
        }),
        onboardingSkip: {
          label: "I'll do this later",
          onSkip: () => advanceTo('balance', { skippedLog: true }),
        },
      })
    } else {
      setBalanceChatOpened(true)
      openChat('', {
        mode: 'full',
        assistantSeed: buildBalanceOpener(currency),
        onboardingSkip: {
          label: 'Skip for now',
          onSkip: () => advanceTo('done', { skippedBalance: true }),
        },
      })
    }
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
      </div>

      <div className="relative flex flex-col items-center gap-2 text-center">
        <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)] ring-1 ring-border/50">
          {isChatStep(step) ? "Onboarding complete — let's finish setup in chat" : 'Welcome to Penda'}
        </span>
        <div className="flex gap-1.5">
          {(isChatStep(step) ? CHAT_PHASE_STEPS : ONBOARDING_STEPS).map((s) => (
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
              Penda is your AI money companion. It logs, plans, and watches your back, all from a
              chat. Start by naming your wallet and picking a currency.
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
          <Button
            onClick={() => void createWalletAndAdvance()}
            disabled={!name.trim() || submitting}
            className="rounded-full"
          >
            {submitting ? 'Setting up…' : 'Next'}
          </Button>
        </div>
      )}

      {step === 'pockets' && (
        <div className="relative flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/50">
          <div className="flex flex-col items-center gap-2 text-center">
            <StepHeading bold="Add your" light="money pockets" />
            <p className="text-sm text-muted-foreground">
              Cash, mobile money, bank, whatever you actually hold money in. We started you off with
              Cash, add more or move on.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {(accounts ?? []).map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background p-3"
              >
                <span aria-hidden>{a.icon ?? '💵'}</span>
                <span className="text-sm font-medium">{a.name}</span>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => setAddPocketOpen(true)}
            disabled={!activeWalletId}
          >
            <Plus className="size-4" />
            Add a pocket
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={goBack} className="flex-1 rounded-full">
              Back
            </Button>
            <Button onClick={() => advanceTo('goal')} className="flex-1 rounded-full">
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 'goal' && (
        <div className="relative flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-[var(--shadow-card)] ring-1 ring-border/50">
          <div className="flex flex-col items-center gap-2 text-center">
            <StepHeading bold="What matters" light="most right now?" />
            <p className="text-sm text-muted-foreground">
              Tell Penda what you&apos;re working toward and it builds your starter plan around it.
              Pick as many as apply, or continue and decide later.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {GOAL_OPTIONS.map((g) => {
              const active = primaryGoals.includes(g.value)
              return (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => toggleGoal(g.value)}
                  aria-pressed={active}
                  className={cn(
                    'flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors',
                    active ? 'border-primary bg-[var(--iris-soft)]' : 'border-border/60 bg-background',
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium">{g.label}</span>
                    <span className="text-xs text-muted-foreground">{g.description}</span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border/70 bg-background',
                    )}
                  >
                    {active && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={goBack} className="flex-1 rounded-full" disabled={submitting}>
              Back
            </Button>
            <Button
              onClick={() => void finishGoals()}
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
              This is the whole app in one move: you talk, Penda logs. Type or talk in the chat, and
              we&apos;ll move on the moment it&apos;s in.
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
            {latestReconciliation ? (
              <>
                <StepHeading bold="Balance" light="saved" />
                <p className="text-sm text-muted-foreground">Your starting number is locked in.</p>
              </>
            ) : (
              <>
                <StepHeading bold="What do you" light="actually have?" />
                <p className="text-sm text-muted-foreground">
                  {balanceChatReturned
                    ? 'Share your balance in chat, then continue when you are ready.'
                    : 'Tell Penda what you actually have in the chat. It powers your safe-to-spend, so every number after this is real.'}
                </p>
              </>
            )}
          </div>
          {latestReconciliation ? (
            <p className="rounded-2xl bg-[var(--mint-soft)]/50 px-3 py-2 text-center text-sm font-medium text-[var(--mint)]">
              Balance saved.
            </p>
          ) : (
            <Button
              className="rounded-full"
              variant={balanceChatReturned ? 'outline' : 'default'}
              onClick={reopenChat}
            >
              {chatOpen ? 'Keep chatting' : 'Open chat with Penda'}
            </Button>
          )}
          {latestReconciliation || balanceChatReturned ? (
            <Button
              className="rounded-full"
              onClick={() =>
                advanceTo('done', {
                  skippedLog: walkthrough?.skippedLog ?? !hasLogged,
                  skippedBalance: false,
                })
              }
            >
              Finish
            </Button>
          ) : (
            <button
              type="button"
              className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() =>
                advanceTo('done', {
                  skippedLog: walkthrough?.skippedLog ?? !hasLogged,
                  skippedBalance: true,
                })
              }
            >
              Skip for now
            </button>
          )}
        </div>
      )}

      <AccountForm
        open={addPocketOpen}
        onOpenChange={setAddPocketOpen}
        walletId={activeWalletId}
        existingNames={(accounts ?? []).map((a) => a.name)}
        isSubmitting={createAccount.isPending}
        onSubmit={async (input) => {
          await createAccount.mutateAsync(input)
        }}
      />
    </main>
  )
}
