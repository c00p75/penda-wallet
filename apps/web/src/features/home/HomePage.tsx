import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { HeroCard } from '@/components/ui/hero-card'
import { SectionHeader } from '@/components/ui/section-header'
import { ActivityRow } from '@/components/ui/activity-row'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { AiMark } from '@/components/AiInsight'
import { Microphone } from '@/components/icons/product'
import { Button } from '@/components/ui/button'
import { cardAccentClass } from '@/components/ui/cardAccent'
import { cn } from '@/lib/utils'
import { captureOverlayOrigin } from '@/lib/overlayOrigin'
import { useAuthStore } from '@/store/authStore'
import { enqueueTransaction } from '@/pwa/offlineQueue'
import { useOfflinePending } from '@/pwa/useOfflineQueue'
import { InstallBanner } from '@/pwa/InstallBanner'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useWalletRealtime } from '@/features/wallets/useWalletRealtime'
import { OnboardingScreen } from '@/features/wallets/OnboardingScreen'
import { useBudgetProgress, useBudgets } from '@/features/budgets/hooks'
import { useSavingsGoals } from '@/features/goals/hooks'
import { useEntitlement } from '@/features/entitlements/hooks'
import { detectCoachingInsights } from '@/features/coaching/detectCoachingInsights'
import type { CoachingAction } from '@/features/coaching/detectCoachingInsights'
import { InsightCarousel, type InsightCard } from '@/features/coaching/InsightCarousel'
import { PaywallSheet } from '@/features/entitlements/PaywallSheet'
import type { PremiumFeature } from '@/features/entitlements/types'
import { loadNeedsYou } from '@/features/chat/pendingNeedsYou'
import {
  useConfirmReceiptItems,
  useCreateTransaction,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from '@/features/transactions/hooks'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import type { ReceiptItemsConfirmInput, Transaction, TransactionInput } from '@/features/transactions/types'
import { useChatStore } from '@/features/chat/chatStore'
import { useQuickActionStore } from '@/features/home/quickActionStore'
import { useUploadReceipt } from '@/features/receipts/hooks'
import { formatMoney, fromMinorUnits } from '@/lib/money'
import { localDateStr, localMonthEnd, localMonthPrefix, localMonthStart } from '@/lib/dates'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { useCategories } from '@/features/categories/hooks'
import { suggestBufferFromIncome } from '@/features/planning/bufferSuggest'
import { useSpendingPlan } from '@/features/planning/hooks'
import { computeSafeToSpend } from '@/features/planning/spendingPlan'
import { upcomingFixedCosts } from '@/features/planning/fixedCosts'
import { totalMonthlyGoalReserve } from '@/features/goals/goalContribution'
import { useRecurringTransactions } from '@/features/recurring/hooks'
import { useDebts } from '@/features/debts/hooks'
import { useProfile } from '@/features/profile/hooks'
import { DEFAULT_COMPANION_PREFS, personalityMeta } from '@/features/profile/types'
import { upsertCoachingNotification } from '@/features/notifications/api'
import { explainSafeToSpend } from '@/features/planning/safeToSpendExplain'
import { ImpulsePauseSheet } from '@/features/impulse/ImpulsePauseSheet'
import { IMPULSE_THRESHOLD_MINOR, useImpulseStore } from '@/features/impulse/impulseStore'
import { usePacts } from '@/features/pacts/hooks'
import { useMemories } from '@/features/memory/hooks'
import { buildCompanionHomeSignals } from '@/features/companion/homeCompanion'
import { applyMoodToCoachingText } from '@/features/companion/moodCoaching'
import { evidenceForInsight } from '@/features/companion/nudgeEvidence'
import { WhyNudgeSheet } from '@/features/companion/WhyNudgeSheet'
import { retargetCheckinMessage } from '@/features/companion/checkinMessage'
import {
  useCompanionCheckins,
  useLatestWeeklyLetter,
  useRespondToCheckin,
} from '@/features/companion/hooks'
import { projectCashflow } from '@/features/cashflow/projection'
import { useLatestReconciliation } from '@/features/reconciliation/hooks'
import { HeroDetailSheet, type HeroDetail } from '@/features/home/HeroDetailSheet'
import { GettingStartedCard } from '@/features/onboarding/GettingStartedCard'
import {
  buildGettingStartedSteps,
  isDayZero,
  isGettingStartedComplete,
  isWalkthroughActive,
  loadGettingStarted,
  patchGettingStarted,
  type GettingStartedState,
  type GettingStartedStepId,
} from '@/features/onboarding/gettingStarted'
import { useOnboardingStore } from '@/features/onboarding/onboardingStore'
import { currencySymbol } from '@/lib/currencies'

/** Split a formatted currency string into whole and decimal parts for big-number display. */
function splitBalance(amountMinor: number, currency: string): { whole: string; decimal: string; symbol: string } {
  const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency }).formatToParts(
    fromMinorUnits(Math.abs(amountMinor)),
  )
  const symbol = parts
    .filter((p) => p.type === 'currency' || p.type === 'literal')
    .map((p) => p.value)
    .join('')
    .trim()
  const whole = parts
    .filter((p) => p.type === 'integer' || p.type === 'group')
    .map((p) => p.value)
    .join('')
  const fraction = parts.find((p) => p.type === 'fraction')?.value
  const decimal = fraction != null ? `${parts.find((p) => p.type === 'decimal')?.value ?? '.'}${fraction}` : ''
  const leadingSymbol = parts[0]?.type === 'currency' || parts[0]?.type === 'literal' ? symbol : ''
  return { symbol: leadingSymbol || symbol, whole: whole || '0', decimal }
}

function greetingLabel(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

function firstNameFromSession(session: { user: { email?: string | null; user_metadata?: Record<string, unknown> } } | null): string {
  const full = (session?.user.user_metadata?.full_name as string | undefined)?.trim()
  if (full) return full.split(/\s+/)[0] ?? full
  const email = session?.user.email
  if (email) return email.split('@')[0] ?? 'there'
  return 'there'
}

export function HomePage() {
  const session = useAuthStore((s) => s.session)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const navigate = useNavigate()
  const openChat = useChatStore((s) => s.openChat)
  const quickActionIntent = useQuickActionStore((s) => s.intent)
  const consumeQuickAction = useQuickActionStore((s) => s.consume)
  const { data: wallet, isLoading: isWalletLoading, wallets } = useCurrentWallet()
  const { data: categories = [] } = useCategories(wallet?.id)
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: budgets = [] } = useBudgets(wallet?.id)
  const { data: budgetProgress = [] } = useBudgetProgress(wallet?.id)
  const { data: goals = [] } = useSavingsGoals(wallet?.id)
  const { data: recurring = [] } = useRecurringTransactions(wallet?.id)
  const { data: debts = [] } = useDebts(wallet?.id)
  const { data: plan } = useSpendingPlan(wallet?.id, localMonthStart())

  const createTransaction = useCreateTransaction(wallet?.id)
  const updateTransaction = useUpdateTransaction(wallet?.id)
  const deleteTransaction = useDeleteTransaction(wallet?.id)
  const confirmReceiptItems = useConfirmReceiptItems(wallet?.id)
  const uploadReceipt = useUploadReceipt(wallet?.id)

  const { isPremium, data: entitlement } = useEntitlement(session?.user.id)
  const { data: profile } = useProfile(session?.user.id)
  const persona = personalityMeta(profile?.ai_personality)
  const blindBudgeting = !!profile?.blind_budgeting
  const pauseImpulse = useImpulseStore((s) => s.pause)
  const isImpulseDismissed = useImpulseStore((s) => s.isDismissed)
  const dismissImpulse = useImpulseStore((s) => s.dismiss)
  const pausedImpulses = useImpulseStore((s) => s.paused)
  const canScanReceipt = isPremium || !entitlement?.receipt_scan_preview_used
  const { data: pacts = [] } = usePacts(wallet?.id)
  const { data: memories = [] } = useMemories(session?.user.id)
  const { data: companionCheckins = [] } = useCompanionCheckins(wallet?.id)
  const { data: weeklyLetter } = useLatestWeeklyLetter(wallet?.id)
  const respondCheckin = useRespondToCheckin(wallet?.id)
  const { data: latestReconciliation } = useLatestReconciliation(wallet?.id, session?.user.id)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [paywallFeature, setPaywallFeature] = useState<PremiumFeature | null>(null)
  const [pendingImpulse, setPendingImpulse] = useState<TransactionInput | null>(null)
  const [needsYouTick, setNeedsYouTick] = useState(0)
  const [whyInsightId, setWhyInsightId] = useState<string | null>(null)
  const [heroDetail, setHeroDetail] = useState<HeroDetail | null>(null)
  const [gettingStarted, setGettingStarted] = useState<GettingStartedState | null>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)
  const walkthroughActive = useOnboardingStore((s) => s.walkthroughActive)
  const setWalkthroughActive = useOnboardingStore((s) => s.setWalkthroughActive)

  useWalletRealtime(wallet?.id)
  const offlineQueue = useOfflinePending()

  // Re-read pending confirms when chat closes so Home "needs you" stays fresh.
  const chatOpen = useChatStore((s) => s.open)
  useEffect(() => {
    if (!chatOpen) setNeedsYouTick((n) => n + 1)
  }, [chatOpen])

  useEffect(() => {
    if (!wallet?.id) {
      setGettingStarted(null)
      return
    }
    setGettingStarted(loadGettingStarted(wallet.id))
    if (isWalkthroughActive(wallet.id)) setWalkthroughActive(true)
  }, [wallet?.id, setWalkthroughActive])

  // Auto-hide residual checklist when every leftover step is done.
  useEffect(() => {
    if (!wallet?.id || !gettingStarted || gettingStarted.dismissed) return
    const steps = buildGettingStartedSteps({
      state: gettingStarted,
      hasTransactions: transactions.length > 0,
      hasReconciled: !!latestReconciliation,
    })
    if (!isGettingStartedComplete(steps)) return
    setGettingStarted(patchGettingStarted(wallet.id, { dismissed: true }))
  }, [
    wallet?.id,
    gettingStarted,
    transactions.length,
    latestReconciliation,
  ])

  function openVoiceCapture(el?: HTMLElement | null) {
    if (el) captureOverlayOrigin(el)
    openChat('', { mode: 'quick', startRecording: true })
  }

  function openAddForm() {
    setEditing(null)
    setFormOpen(true)
  }

  function openReceiptPicker() {
    receiptInputRef.current?.click()
  }

  function openScanReceipt() {
    if (canScanReceipt) {
      openReceiptPicker()
      return
    }
    setPaywallFeature('receipt-scan')
  }

  useEffect(() => {
    if (!quickActionIntent || !wallet) return
    const intent = consumeQuickAction()
    if (!intent) return
    if (intent === 'add-txn') {
      openAddForm()
      return
    }
    openScanReceipt()
  }, [quickActionIntent, wallet])

  // Must run before any early return, otherwise React crashes after splash when
  // auth/wallet resolve and this hook appears on a later render.
  const coachingInsights = detectCoachingInsights({
    transactions,
    budgets,
    goals,
    currency: wallet?.base_currency ?? 'USD',
  })
  // Hooks below must stay unconditional, companion signals use the same data.
  const companionSafeDailyMinor = (() => {
    if (!plan) return null
    const now = new Date()
    const monthSpent = transactions
      .filter((tx) => tx.type === 'expense' && tx.transaction_date.startsWith(localMonthPrefix(now)))
      .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)
    return computeSafeToSpend({
      intendedMinor: plan.intended_amount_minor,
      spentMinor: monthSpent,
      upcomingFixedMinor:
        upcomingFixedCosts(recurring, localDateStr(now), localMonthEnd(now)).totalMinor +
        totalMonthlyGoalReserve(goals, now),
      monthStart: localMonthStart(now),
      now,
    }).perDayMinor
  })()

  const companionSignals = buildCompanionHomeSignals(
    {
      prefs: profile?.companion_prefs ?? DEFAULT_COMPANION_PREFS,
      mode: profile?.mode ?? 'individual',
      currency: wallet?.base_currency ?? 'USD',
      personaName: persona.name,
      memories,
      pacts,
      transactions,
      goals,
      recurring,
      pausedImpulses,
      freeBeforeNextIncomeMinor: (() => {
        if (!wallet) return null
        const balance = transactions.reduce((sum, tx) => {
          const amt = tx.converted_amount_minor ?? tx.amount_minor
          return sum + (tx.type === 'income' ? amt : -amt)
        }, 0)
        const avgDaily =
          transactions
            .filter((t) => t.type === 'expense')
            .slice(0, 30)
            .reduce((s, t) => s + (t.converted_amount_minor ?? t.amount_minor), 0) / 30
        return projectCashflow({
          startingBalanceMinor: balance,
          recurring,
          avgDailySpendMinor: avgDaily,
          from: new Date(),
          days: 45,
        }).freeBeforeNextIncomeMinor
      })(),
      weeklyLetterTeaser: weeklyLetter
        ? retargetCheckinMessage(
            `${weeklyLetter.title}: ${weeklyLetter.body.slice(0, 120)}…`,
            persona.name,
          )
        : null,
      debts,
      lifeEvent: profile?.life_event ?? null,
      safeDailyMinor: companionSafeDailyMinor,
    },
    {
      openChat: (seed, opts) => openChat(seed, { autoSend: opts?.autoSend, mode: 'full' }),
      navigate,
      openWhy: setWhyInsightId,
    },
  )
  const suggestion = companionSignals.quiet ? undefined : coachingInsights[0]

  useEffect(() => {
    if (!wallet?.id || !suggestion) return
    const href =
      suggestion.action?.kind === 'fund-goal' || suggestion.action?.kind === 'view-goals'
        ? '/goals'
        : '/budgets'
    void upsertCoachingNotification({
      walletId: wallet.id,
      title: 'Penda tip',
      body: suggestion.text,
      href,
      dedupeKey: `coaching:${suggestion.kind}:${localDateStr(new Date())}`,
    }).catch(() => {
      // Best-effort inbox sync, never block the home surface.
    })
  }, [wallet?.id, suggestion?.id, suggestion?.kind, suggestion?.text, suggestion?.action?.kind])

  async function saveOffline(input: TransactionInput) {
    if (!wallet || !session) return
    await enqueueTransaction(wallet.id, session.user.id, input)
    await offlineQueue.refreshCount()
    toast("Saved offline. It'll sync when you're back online.")
  }

  async function commitTransaction(input: TransactionInput) {
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

  async function handleSubmit(input: TransactionInput) {
    if (
      !editing &&
      input.type === 'expense' &&
      input.amount_minor >= IMPULSE_THRESHOLD_MINOR
    ) {
      const promptId = `impulse:${input.amount_minor}:${input.merchant ?? ''}:${input.transaction_date}`
      if (!isImpulseDismissed(promptId) && !useImpulseStore.getState().paused.some((p) => p.id === promptId)) {
        setPendingImpulse(input)
        return
      }
    }
    await commitTransaction(input)
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

  async function handleConfirmReceiptItems(input: ReceiptItemsConfirmInput) {
    if (!editing) return
    try {
      await confirmReceiptItems.mutateAsync({ draft: editing, input })
      toast(
        input.items.length === 1
          ? 'Receipt confirmed.'
          : `${input.items.length} items logged from receipt.`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
      throw error
    }
  }

  async function handleReceiptSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const toastId = toast.loading('Scanning receipt…')
    try {
      const draft = await uploadReceipt.mutateAsync(file)
      toast.dismiss(toastId)
      setEditing(draft)
      setFormOpen(true)
    } catch (error) {
      toast.dismiss(toastId)
      toast.error(error instanceof Error ? error.message : 'Could not read that receipt.')
    }
  }

  if (isAuthLoading) return null
  if (!session) return <Navigate to="/login" replace />
  if (isWalletLoading) return null
  if (
    wallets.length === 0 ||
    walkthroughActive ||
    (!!wallet && isWalkthroughActive(wallet.id))
  ) {
    return <OnboardingScreen />
  }
  if (!wallet) return null

  const currency = wallet.base_currency
  const now = new Date()
  const name = firstNameFromSession(session)
  const greet = greetingLabel(now)

  const balanceMinor = transactions.reduce((sum, tx) => {
    const amt = tx.converted_amount_minor ?? tx.amount_minor
    return sum + (tx.type === 'income' ? amt : tx.type === 'expense' ? -amt : 0)
  }, 0)
  const thisMonthPrefix = localMonthPrefix(now)
  const thisMonthTx = transactions.filter((tx) => tx.transaction_date.startsWith(thisMonthPrefix))
  const monthSpending = thisMonthTx
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)
  const balanceParts = splitBalance(balanceMinor, currency)
  const isNegative = balanceMinor < 0

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - now.getDate() + 1

  const monthlyBudgets = budgetProgress.filter((b) => b.period === 'monthly')
  const totalBudgetMinor = monthlyBudgets.reduce((sum, b) => sum + b.effective_amount_minor, 0)
  const totalSpentMinor = monthlyBudgets.reduce((sum, b) => sum + b.spent_minor, 0)
  const monthSpentForPlan = thisMonthTx
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + (tx.converted_amount_minor ?? tx.amount_minor), 0)
  const planSafe = plan
    ? computeSafeToSpend({
        intendedMinor: plan.intended_amount_minor,
        spentMinor: monthSpentForPlan,
        upcomingFixedMinor:
          upcomingFixedCosts(recurring, localDateStr(now), localMonthEnd(now)).totalMinor +
          totalMonthlyGoalReserve(goals, now),
        monthStart: localMonthStart(now),
        now,
      })
    : null
  const remainingBudgetMinor = planSafe
    ? planSafe.discretionaryRemainingMinor
    : totalBudgetMinor - totalSpentMinor
  const hasBudgets = plan ? plan.intended_amount_minor > 0 : totalBudgetMinor > 0
  const safeToSpendPerDayMinor = planSafe
    ? Math.max(0, planSafe.perDayMinor)
    : Math.max(0, Math.round(remainingBudgetMinor / daysLeft))

  // Prefer a goal with real progress; hide the card when every goal is still at 0.
  const topGoal = [...goals]
    .filter((g) => g.current_amount_minor > 0)
    .sort(
      (a, b) =>
        b.current_amount_minor / Math.max(1, b.target_amount_minor) -
        a.current_amount_minor / Math.max(1, a.target_amount_minor),
    )[0]
  const topGoalPct =
    topGoal && topGoal.target_amount_minor > 0
      ? Math.round((topGoal.current_amount_minor / topGoal.target_amount_minor) * 100)
      : null

  const weekCutoff = new Date()
  weekCutoff.setDate(weekCutoff.getDate() - 7)
  const weekCutoffStr = localDateStr(weekCutoff)
  const last7Spent = transactions
    .filter((tx) => tx.type === 'expense' && tx.transaction_date >= weekCutoffStr)
    .reduce((sum, tx) => sum + tx.amount_minor, 0)
  const buffer = suggestBufferFromIncome(transactions, {
    availableBalanceMinor: balanceMinor,
  })
  const dayZero = isDayZero(transactions.length)
  const sym = currencySymbol(currency)

  const weekInsight =
    buffer != null
      ? `That ${formatMoney(buffer.incomeTx.amount_minor, currency)} cash-in is large. Move ${formatMoney(buffer.suggestMinor, currency)} to a buffer for next month?`
      : last7Spent > 0
        ? `You've spent ${formatMoney(last7Spent, currency)} in the last 7 days.`
        : "Nothing logged this week yet. Tell me about a purchase and I'll take it from there."

  function askAboutInsight(text: string) {
    openChat(`${text}. Tell me more / what should I do?`, { autoSend: true, mode: 'full' })
  }

  const gettingStartedSteps = buildGettingStartedSteps({
    state: gettingStarted ?? { dismissed: false, balanceTouched: false, planPeeked: false },
    hasTransactions: transactions.length > 0,
    hasReconciled: !!latestReconciliation,
  })
  const residualSteps = gettingStartedSteps.filter((s) => !s.done)
  const showGettingStarted =
    !!gettingStarted &&
    !gettingStarted.dismissed &&
    residualSteps.length > 0 &&
    !isGettingStartedComplete(gettingStartedSteps)

  function handleGettingStartedStep(id: GettingStartedStepId) {
    if (!wallet) return
    if (id === 'log') {
      openChat(`I spent ${sym}`, { mode: 'quick' })
      return
    }
    if (id === 'balance') {
      setGettingStarted(patchGettingStarted(wallet.id, { balanceTouched: true }))
      openChat(`My balance is ${sym}`, { mode: 'full' })
      return
    }
    setGettingStarted(patchGettingStarted(wallet.id, { planPeeked: true }))
    navigate('/budgets')
  }

  function runInsightAction(insightText: string, action: CoachingAction) {
    // Stay in the AI loop, open chat with the tip; ledger pages stay secondary.
    const followUp =
      action.kind === 'create-budget'
        ? `${insightText} Help me create a budget for this.`
        : action.kind === 'fund-goal'
          ? `${insightText} Help me fund this goal.`
          : `${insightText} What should I do next?`
    openChat(followUp, { autoSend: true, mode: 'full' })
  }

  const needsYou = loadNeedsYou(wallet.id)
  // Touch needsYouTick so the list refreshes after chat closes.
  void needsYouTick

  const auraLabel = dayZero
    ? 'Getting started'
    : balanceMinor > monthSpending
      ? 'Comfortable'
      : balanceMinor > 0
        ? 'Tight'
        : 'Stretched'

  const briefPrimary = dayZero
    ? "Your wallet is ready. Log one purchase and I'll start building your picture."
    : weekInsight
  const briefSecondary = dayZero
    ? 'You can also tell me your current balance, or peek at the starter plan I set up.'
    : auraLabel === 'Comfortable'
      ? "You're in good shape. Ask me before a big buy if you want a second opinion."
      : auraLabel === 'Tight'
        ? 'Things are tight. I can help you pick what to pause.'
        : "Cash is stretched. Let's find the leak together."

  const checkinCards: InsightCard[] =
    dayZero || companionCheckins.length === 0
      ? []
      : companionCheckins.slice(0, 3).map((c) => {
          const body = retargetCheckinMessage(c.message, persona.name)
          const isPact = c.kind === 'pact' || c.kind === 'impulse'
          const respond = (status: 'kept' | 'slipped' | 'dismissed' | 'answered') => {
            if (respondCheckin.isPending) return
            if (status === 'answered' || status === 'kept' || status === 'slipped') {
              openChat(body, { autoSend: true, mode: 'full' })
            }
            respondCheckin.mutate({ id: c.id, status })
          }
          return {
            id: `checkin:${c.id}`,
            variant: 'tip' as const,
            tone: 'warm' as const,
            label: `${persona.name}:`,
            text: body,
            persona: { value: persona.value, accent: persona.accent },
            actions: isPact
              ? [
                  { label: 'Kept it', onTap: () => respond('kept') },
                  { label: 'Slipped', variant: 'outline' as const, onTap: () => respond('slipped') },
                  { label: 'Not now', variant: 'outline' as const, onTap: () => respond('dismissed') },
                ]
              : [
                  { label: 'Talk about it', onTap: () => respond('answered') },
                  { label: 'Dismiss', variant: 'outline' as const, onTap: () => respond('dismissed') },
                ],
          }
        })

  const insightCards: InsightCard[] = [
    {
      id: 'week-read',
      variant: 'read',
      tone: dayZero || buffer != null ? 'warm' : 'default',
      text: briefPrimary,
      secondary: briefSecondary,
      actions: [
        {
          label: dayZero ? 'Log a purchase' : 'What should I do?',
          onTap: () =>
            openChat(dayZero ? `I spent ${sym}` : `${briefPrimary}. Tell me more / what should I do?`, {
              mode: dayZero ? 'quick' : 'full',
              autoSend: !dayZero,
            }),
        },
        {
          label: dayZero ? 'Set my balance' : 'Log a purchase',
          variant: 'outline',
          onTap: () => {
            if (dayZero) {
              setGettingStarted(patchGettingStarted(wallet.id, { balanceTouched: true }))
              openChat(`My balance is ${sym}`, { mode: 'full' })
              return
            }
            openChat('I spent ', { mode: 'quick' })
          },
        },
      ],
      onWhy: dayZero ? undefined : () => setWhyInsightId('week-read'),
    },
    ...checkinCards,
    ...(dayZero
      ? []
      : [
          ...companionSignals.cards.map((card) => ({
            ...card,
            onWhy: () => setWhyInsightId(card.id),
          })),
          ...(companionSignals.quiet
            ? []
            : coachingInsights.map((insight) => ({
                id: insight.id,
                variant: 'tip' as const,
                tone: insight.tone,
                label: 'Pro tip:',
                text: applyMoodToCoachingText(insight.text, companionSignals.moodTone),
                action: insight.action
                  ? {
                      label: insight.action.label,
                      onTap: () => runInsightAction(insight.text, insight.action!),
                    }
                  : { label: 'Ask Penda', onTap: () => askAboutInsight(insight.text) },
                onWhy: () => setWhyInsightId(insight.id),
              }))),
        ]),
  ]

  const upcoming = (() => {
    const today = localDateStr(now)
    const active = recurring
      .filter((r) => r.is_active && r.next_run_date >= today)
      .sort((a, b) => a.next_run_date.localeCompare(b.next_run_date))
    const next = active[0]
    if (!next) return null
    const when =
      next.next_run_date === today
        ? 'Today'
        : next.next_run_date === localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
          ? 'Tomorrow'
          : new Date(next.next_run_date + 'T12:00:00').toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })
    return {
      title: next.template.merchant || next.template.description || 'Upcoming bill',
      when,
      amountMinor: next.template.amount_minor,
      icon: next.template.type === 'income' ? '💰' : '🧾',
    }
  })()

  const recent = [...transactions]
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at))
    .slice(0, 5)

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader />

      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleReceiptSelected}
      />

      <main className="flex flex-1 flex-col gap-6 px-4 pb-40">
        <InstallBanner />

        {/* Greeting + capture */}
        <section className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[2.5rem] leading-[1.05] tracking-tight text-foreground">
              <span className="font-bold">{greet}</span>
              <br />
              <span className="font-light">{name}</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {wallet.name}
              <span className="mx-1.5 text-border">·</span>
              <span
                style={{
                  color:
                    auraLabel === 'Getting started'
                      ? 'var(--iris)'
                      : auraLabel === 'Comfortable'
                        ? 'var(--iris)'
                        : auraLabel === 'Tight'
                          ? 'var(--rose)'
                          : 'var(--rose)',
                }}
              >
                {auraLabel}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => openVoiceCapture(e.currentTarget)}
            aria-label="Tell Penda with voice"
            className="mt-1 grid size-11 shrink-0 place-items-center rounded-2xl border border-border/70 bg-card text-foreground shadow-[var(--shadow-card)] transition-transform active:scale-95"
          >
            <Microphone className="size-5" weight="fill" />
          </button>
        </section>

        {showGettingStarted && (
          <GettingStartedCard
            steps={residualSteps}
            onDismiss={() =>
              setGettingStarted(patchGettingStarted(wallet.id, { dismissed: true }))
            }
            onStep={handleGettingStartedStep}
          />
        )}

        {/* Pending confirms. ActionTrail continuity */}
        {!dayZero && needsYou.length > 0 && (
          <section>
            <SectionHeader title="Penda needs you" />
            <div className="flex flex-col gap-2">
              {needsYou.map((item) => (
                <button
                  key={item.action.id}
                  type="button"
                  onClick={(e) => {
                    captureOverlayOrigin(e.currentTarget)
                    openChat('', { mode: 'full' })
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl bg-card px-3.5 py-3 text-left shadow-[var(--shadow-soft)] transition-transform active:scale-[0.99]',
                    cardAccentClass('rose'),
                  )}
                >
                  <AiMark className="size-7" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.preview}</p>
                    <p className="text-xs text-muted-foreground">Tap to confirm or cancel</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Primary number, demoted carousel. Day zero: balance only. */}
        <div className="-mx-4 overflow-x-auto pb-1 [scrollbar-width:none] pt-8 -mt-4">
          <div className="flex w-max gap-3 px-4 snap-x snap-mandatory pb-[3rem]">
            <HeroCard
              tone="iris"
              className="snap-start"
              onClick={() => {
                const balanceLabel = `${isNegative ? '−' : ''}${formatMoney(Math.abs(balanceMinor), currency)}`
                if (dayZero || (!hasBudgets && !blindBudgeting)) {
                  setHeroDetail({ kind: 'balance', valueLabel: balanceLabel })
                  return
                }
                if (blindBudgeting) {
                  setHeroDetail({ kind: 'status', valueLabel: auraLabel })
                  return
                }
                const explained = planSafe
                  ? explainSafeToSpend(
                      {
                        intendedMinor: plan!.intended_amount_minor,
                        spentMinor: monthSpentForPlan,
                        upcomingFixedMinor: planSafe.reservedFixedMinor,
                        daysLeftInMonth: planSafe.daysLeftInclusive,
                        safeDailyMinor: planSafe.perDayMinor,
                        safeTotalMinor: planSafe.discretionaryRemainingMinor,
                      },
                      (m) => formatMoney(m, currency),
                    )
                  : {
                      summary: 'Safe to spend from your budgets and days left in the month.',
                      bullets: ['Open budgets to refine the plan behind this number.'],
                    }
                setHeroDetail({
                  kind: 'safe-to-spend',
                  valueLabel: `${formatMoney(safeToSpendPerDayMinor, currency)}/day`,
                  summary: explained.summary,
                  bullets: explained.bullets,
                })
              }}
              label={
                dayZero
                  ? 'Balance'
                  : blindBudgeting
                    ? 'Status'
                    : hasBudgets
                      ? 'Safe to spend'
                      : 'Balance'
              }
              value={
                dayZero || (!hasBudgets && !blindBudgeting) ? (
                  <HiddenAmount>
                    <span>
                      {isNegative ? '−' : ''}
                      {balanceParts.symbol}
                      {balanceParts.symbol.endsWith(' ') ? '' : '\u00A0'}
                      {balanceParts.whole}
                      {balanceParts.decimal && (
                        <span className="text-lg font-semibold opacity-80">{balanceParts.decimal}</span>
                      )}
                    </span>
                  </HiddenAmount>
                ) : blindBudgeting ? (
                  auraLabel
                ) : (
                  <HiddenAmount>
                    <span>
                      {formatMoney(safeToSpendPerDayMinor, currency)}
                      <span className="text-sm font-medium opacity-80">{'\u00A0'}/day</span>
                    </span>
                  </HiddenAmount>
                )
              }
            />
            {!dayZero && hasBudgets && (
              <HeroCard
                tone="iris"
                className="snap-start"
                onClick={() =>
                  setHeroDetail({
                    kind: 'balance',
                    valueLabel: `${isNegative ? '−' : ''}${formatMoney(Math.abs(balanceMinor), currency)}`,
                  })
                }
                label="Balance"
                value={
                  <HiddenAmount>
                    <span>
                      {isNegative ? '−' : ''}
                      {balanceParts.symbol}
                      {balanceParts.symbol.endsWith(' ') ? '' : '\u00A0'}
                      {balanceParts.whole}
                      {balanceParts.decimal && (
                        <span className="text-lg font-semibold opacity-80">{balanceParts.decimal}</span>
                      )}
                    </span>
                  </HiddenAmount>
                }
              />
            )}
            {!dayZero && topGoal && (
              <HeroCard
                tone="apricot"
                className="snap-start"
                onClick={() =>
                  setHeroDetail({
                    kind: 'goal',
                    name: topGoal.name,
                    goalId: topGoal.id,
                    valueLabel: `${topGoalPct ?? 0}%`,
                    progressLine: `${formatMoney(topGoal.current_amount_minor, currency)} of ${formatMoney(topGoal.target_amount_minor, currency)}`,
                  })
                }
                label={topGoal.name}
                value={
                  <HiddenAmount>
                    <span>
                      {topGoalPct ?? 0}
                      <span className="text-lg font-semibold opacity-80">%</span>
                    </span>
                  </HiddenAmount>
                }
              />
            )}
            {!dayZero && (blindBudgeting || monthSpending > 0) && (
              <HeroCard
                tone="mint"
                className="snap-start"
                onClick={() =>
                  setHeroDetail({
                    kind: 'month',
                    valueLabel: blindBudgeting ? 'Hidden' : formatMoney(monthSpending, currency),
                  })
                }
                label="This month"
                value={
                  blindBudgeting ? (
                    '···'
                  ) : (
                    <HiddenAmount>{formatMoney(monthSpending, currency)}</HiddenAmount>
                  )
                }
              />
            )}
          </div>
        </div>

        <InsightCarousel cards={insightCards} />

        {!dayZero && upcoming && (
          <section>
            <SectionHeader title="Upcoming" actionLabel="See all" actionTo="/cashflow" />
            <button
              type="button"
              onClick={(e) => {
                captureOverlayOrigin(e.currentTarget)
                openChat(
                  `Upcoming: ${upcoming.title} (${upcoming.when}) for ${formatMoney(upcoming.amountMinor, currency)}. What should I prepare?`,
                  { autoSend: true },
                )
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-[1.5rem] bg-card p-4 text-left shadow-[var(--shadow-card)] transition-transform active:scale-[0.99]',
                cardAccentClass('iris'),
              )}
            >
              <span
                className="grid size-12 place-items-center rounded-2xl text-xl"
                style={{ background: 'var(--iris-soft)' }}
              >
                {upcoming.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{upcoming.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{upcoming.when}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                    style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}
                  >
                    <HiddenAmount>{formatMoney(upcoming.amountMinor, currency)}</HiddenAmount>
                  </span>
                </div>
              </div>
            </button>
          </section>
        )}

        {/* Recent activity, capture via Penda, form for edit */}
        <section>
          <SectionHeader
            title="Recent activity"
            actionLabel="View all"
            actionTo="/transactions"
            leadingAction={
              <button
                type="button"
                onClick={(e) => {
                  captureOverlayOrigin(e.currentTarget)
                  openChat('I spent ', { mode: 'quick' })
                }}
                className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
              >
                Tell Penda
              </button>
            }
          />
          {recent.length === 0 ? (
            <div className="flex flex-col items-start gap-2 px-1">
              <p className="text-sm text-muted-foreground">
                Nothing logged yet. Tell Penda about a purchase or hold the mic.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={(e) => {
                  captureOverlayOrigin(e.currentTarget)
                  openChat('I spent ', { mode: 'quick' })
                }}
              >
                Log with Penda
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {recent.map((tx) => {
                const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''
                return (
                  <ActivityRow
                    key={tx.id}
                    onClick={() => {
                      setEditing(tx)
                      setFormOpen(true)
                    }}
                    avatar={<span>{tx.category?.icon ?? (tx.type === 'income' ? '💰' : '💳')}</span>}
                    title={tx.merchant || tx.description || tx.category?.name || 'Transaction'}
                    subtitle={
                      <>
                        {tx.category?.name ?? 'Uncategorized'}
                        <span className="mx-1">·</span>
                        {new Date(tx.transaction_date + 'T12:00:00').toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </>
                    }
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
          )}
        </section>
      </main>

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        currency={currency}
        walletId={wallet.id}
        transaction={editing}
        onSubmit={handleSubmit}
        onConfirmItems={
          editing?.source === 'receipt' && !editing.user_confirmed
            ? handleConfirmReceiptItems
            : undefined
        }
        onDelete={editing ? handleDelete : undefined}
        isSubmitting={
          createTransaction.isPending ||
          updateTransaction.isPending ||
          confirmReceiptItems.isPending
        }
      />

      <PaywallSheet
        feature={paywallFeature}
        onOpenChange={(open) => !open && setPaywallFeature(null)}
        onPreviewOnce={openReceiptPicker}
      />

      <ImpulsePauseSheet
        open={!!pendingImpulse}
        onOpenChange={(open) => {
          if (!open) setPendingImpulse(null)
        }}
        amountMinor={pendingImpulse?.amount_minor ?? 0}
        currency={pendingImpulse?.currency ?? currency}
        merchant={pendingImpulse?.merchant ?? null}
        onPause={() => {
          if (!pendingImpulse) return
          const id = `impulse:${pendingImpulse.amount_minor}:${pendingImpulse.merchant ?? ''}:${pendingImpulse.transaction_date}`
          pauseImpulse({
            id,
            amountMinor: pendingImpulse.amount_minor,
            currency: pendingImpulse.currency,
            merchant: pendingImpulse.merchant,
            description: pendingImpulse.description,
          })
          toast('Paused for 24h. Come back tomorrow if you still want it.')
          setPendingImpulse(null)
          setFormOpen(false)
        }}
        onProceed={() => {
          if (!pendingImpulse) return
          const id = `impulse:${pendingImpulse.amount_minor}:${pendingImpulse.merchant ?? ''}:${pendingImpulse.transaction_date}`
          dismissImpulse(id)
          const input = pendingImpulse
          setPendingImpulse(null)
          void commitTransaction(input)
        }}
      />

      <WhyNudgeSheet
        open={!!whyInsightId}
        onOpenChange={(open) => !open && setWhyInsightId(null)}
        evidence={
          whyInsightId === 'safe-to-spend' && planSafe
            ? {
                insightId: 'safe-to-spend',
                ...explainSafeToSpend(
                  {
                    intendedMinor: plan!.intended_amount_minor,
                    spentMinor: monthSpentForPlan,
                    upcomingFixedMinor: planSafe.reservedFixedMinor,
                    daysLeftInMonth: planSafe.daysLeftInclusive,
                    safeDailyMinor: planSafe.perDayMinor,
                    safeTotalMinor: planSafe.discretionaryRemainingMinor,
                  },
                  (m) => formatMoney(m, currency),
                ),
              }
            : whyInsightId
              ? evidenceForInsight(whyInsightId)
              : null
        }
      />

      <HeroDetailSheet
        detail={heroDetail}
        onOpenChange={(open) => !open && setHeroDetail(null)}
        onNavigate={(href) => navigate(href)}
      />

      <BottomNav />
    </div>
  )
}
