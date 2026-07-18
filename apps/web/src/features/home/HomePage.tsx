import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { HeroCard } from '@/components/ui/hero-card'
import { SectionHeader } from '@/components/ui/section-header'
import { ActivityRow } from '@/components/ui/activity-row'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { AiMark } from '@/components/AiInsight'
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
import { PaywallSheet } from '@/features/entitlements/PaywallSheet'
import type { PremiumFeature } from '@/features/entitlements/types'
import { useCreateTransaction, useDeleteTransaction, useTransactions, useUpdateTransaction } from '@/features/transactions/hooks'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import { MoMoPasteSheet, parsedToDraft } from '@/features/transactions/MoMoPasteSheet'
import { parseMoMoText } from '@/features/transactions/momoParser'
import type { Transaction, TransactionDraft, TransactionInput } from '@/features/transactions/types'
import { useChatStore } from '@/features/chat/chatStore'
import { useQuickActionStore } from '@/features/home/quickActionStore'
import { useUploadReceipt } from '@/features/receipts/hooks'
import { formatMoney, fromMinorUnits } from '@/lib/money'
import { localDateStr, localMonthEnd, localMonthPrefix, localMonthStart } from '@/lib/dates'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { useCategories } from '@/features/categories/hooks'
import { ReconcilePrompt } from '@/features/reconciliation/ReconcilePrompt'
import { suggestBufferFromIncome } from '@/features/planning/bufferSuggest'
import { useSpendingPlan } from '@/features/planning/hooks'
import { computeSafeToSpend } from '@/features/planning/spendingPlan'
import { upcomingFixedCosts } from '@/features/planning/fixedCosts'
import { totalMonthlyGoalReserve } from '@/features/goals/goalContribution'
import { useRecurringTransactions } from '@/features/recurring/hooks'
import { useProfile } from '@/features/profile/hooks'
import { ImpulsePauseSheet } from '@/features/impulse/ImpulsePauseSheet'
import { IMPULSE_THRESHOLD_MINOR, useImpulseStore } from '@/features/impulse/impulseStore'

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
  const { data: plan } = useSpendingPlan(wallet?.id, localMonthStart())

  const createTransaction = useCreateTransaction(wallet?.id)
  const updateTransaction = useUpdateTransaction(wallet?.id)
  const deleteTransaction = useDeleteTransaction(wallet?.id)
  const uploadReceipt = useUploadReceipt(wallet?.id)

  const { isPremium } = useEntitlement(session?.user.id)
  const { data: profile } = useProfile(session?.user.id)
  const blindBudgeting = !!profile?.blind_budgeting
  const pauseImpulse = useImpulseStore((s) => s.pause)
  const isImpulseDismissed = useImpulseStore((s) => s.isDismissed)
  const dismissImpulse = useImpulseStore((s) => s.dismiss)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [momoDraft, setMomoDraft] = useState<TransactionDraft | null>(null)
  const [momoReportedBalance, setMomoReportedBalance] = useState<number | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteInitialText, setPasteInitialText] = useState('')
  const [paywallFeature, setPaywallFeature] = useState<PremiumFeature | null>(null)
  const [pendingImpulse, setPendingImpulse] = useState<TransactionInput | null>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  useWalletRealtime(wallet?.id)
  const offlineQueue = useOfflinePending()

  function openAddForm() {
    setEditing(null)
    setMomoDraft(null)
    setFormOpen(true)
  }

  function openScanReceipt() {
    if (isPremium || localStorage.getItem('penda:preview:receipt-scan') === '1') {
      receiptInputRef.current?.click()
      return
    }
    setPaywallFeature('receipt-scan')
  }

  async function openPaste() {
    let clip = ''
    try {
      clip = (await navigator.clipboard?.readText()) ?? ''
    } catch {
      // Clipboard read blocked — fall back to paste.
    }
    const parsed = clip ? parseMoMoText(clip) : null
    if (parsed) {
      setEditing(null)
      setMomoDraft(parsedToDraft(parsed))
      setFormOpen(true)
      return
    }
    setPasteInitialText(clip)
    setPasteOpen(true)
  }

  useEffect(() => {
    if (!quickActionIntent || !wallet) return
    const intent = consumeQuickAction()
    if (!intent) return
    if (intent === 'add-txn') {
      openAddForm()
      return
    }
    if (intent === 'paste-momo') {
      void openPaste()
      return
    }
    openScanReceipt()
  }, [quickActionIntent, wallet])

  async function saveOffline(input: TransactionInput) {
    if (!wallet || !session) return
    await enqueueTransaction(wallet.id, session.user.id, input)
    await offlineQueue.refreshCount()
    toast("Saved offline — it'll sync when you're back online.")
  }

  async function commitTransaction(input: TransactionInput) {
    if (!editing && !navigator.onLine) {
      await saveOffline(input)
      return
    }
    const reportedBalance = !editing ? (momoDraft?.reported_balance_minor ?? null) : null
    try {
      if (editing) {
        const wasDraft = editing.source === 'receipt' && !editing.user_confirmed
        await updateTransaction.mutateAsync({ id: editing.id, input, version: editing.version })
        toast(wasDraft ? 'Receipt confirmed.' : 'Transaction updated.')
      } else {
        await createTransaction.mutateAsync(input)
        toast('Transaction added.')
        if (reportedBalance != null) setMomoReportedBalance(reportedBalance)
        setMomoDraft(null)
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

  async function handleReconcileAdjust(deltaMinor: number) {
    if (!wallet) return
    await createTransaction.mutateAsync({
      category_id: null,
      amount_minor: Math.abs(deltaMinor),
      currency: wallet.base_currency,
      type: deltaMinor > 0 ? 'income' : 'expense',
      merchant: null,
      description: 'Balance reconciliation adjustment',
      transaction_date: localDateStr(),
    })
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
  if (wallets.length === 0) return <OnboardingScreen />
  if (!wallet) return null

  const currency = wallet.base_currency
  const now = new Date()
  const name = firstNameFromSession(session)
  const greet = greetingLabel(now)

  const balanceMinor = transactions.reduce(
    (sum, tx) => sum + (tx.type === 'income' ? tx.amount_minor : tx.type === 'expense' ? -tx.amount_minor : 0),
    0,
  )
  const thisMonthPrefix = localMonthPrefix(now)
  const thisMonthTx = transactions.filter((tx) => tx.transaction_date.startsWith(thisMonthPrefix))
  const monthSpending = thisMonthTx
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount_minor, 0)
  const balanceParts = splitBalance(balanceMinor, currency)
  const isNegative = balanceMinor < 0

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - now.getDate() + 1

  const monthlyBudgets = budgetProgress.filter((b) => b.period === 'monthly')
  const totalBudgetMinor = monthlyBudgets.reduce((sum, b) => sum + b.effective_amount_minor, 0)
  const totalSpentMinor = monthlyBudgets.reduce((sum, b) => sum + b.spent_minor, 0)
  const monthSpentForPlan = thisMonthTx
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount_minor, 0)
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

  const topGoal = [...goals].sort(
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
  const buffer = suggestBufferFromIncome(transactions)
  const weekInsight =
    buffer != null
      ? `That ${formatMoney(buffer.incomeTx.amount_minor, currency)} cash-in is large — move ${formatMoney(buffer.suggestMinor, currency)} to a buffer for next month?`
      : last7Spent > 0
        ? `You've spent ${formatMoney(last7Spent, currency)} in the last 7 days.`
        : "Nothing logged this week yet — tell me about a purchase and I'll take it from there."

  const coachingInsights = detectCoachingInsights({ transactions, budgets, goals, currency })
  const suggestion = coachingInsights[0]

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

  const auraLabel =
    balanceMinor > monthSpending ? 'Comfortable' : balanceMinor > 0 ? 'Tight' : 'Stretched'

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

      {momoReportedBalance != null && session && (
        <div className="px-4 pt-2">
          <ReconcilePrompt
            walletId={wallet.id}
            userId={session.user.id}
            currency={currency}
            computedBalanceMinor={balanceMinor}
            suggestedActualMinor={momoReportedBalance}
            onResolved={() => setMomoReportedBalance(null)}
            onAdjust={handleReconcileAdjust}
          />
        </div>
      )}

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

        {/* Greeting */}
        <section>
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
                  auraLabel === 'Comfortable'
                    ? 'var(--mint)'
                    : auraLabel === 'Tight'
                      ? 'var(--apricot)'
                      : 'var(--rose)',
              }}
            >
              {auraLabel}
            </span>
          </p>
        </section>

        {/* Hero carousel */}
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory [scrollbar-width:none]">
          <HeroCard
            tone="iris"
            className="snap-start"
            label="Balance"
            value={
              blindBudgeting ? (
                auraLabel
              ) : (
                <HiddenAmount>
                  <span>
                    {isNegative ? '−' : ''}
                    {balanceParts.symbol}
                    {balanceParts.whole}
                    {balanceParts.decimal && (
                      <span className="text-xl font-semibold opacity-80">{balanceParts.decimal}</span>
                    )}
                  </span>
                </HiddenAmount>
              )
            }
          />
          {hasBudgets && (
            <HeroCard
              tone="mint"
              className="snap-start"
              label="Safe to spend"
              value={
                <HiddenAmount>
                  <span>
                    {formatMoney(safeToSpendPerDayMinor, currency)}
                    <span className="text-base font-medium opacity-80"> /day</span>
                  </span>
                </HiddenAmount>
              }
            />
          )}
          {topGoal && (
            <HeroCard
              tone="apricot"
              className="snap-start"
              onClick={() => navigate(`/goals/${topGoal.id}`)}
              label={topGoal.name}
              value={
                <HiddenAmount>
                  <span>
                    {topGoalPct ?? 0}
                    <span className="text-xl font-semibold opacity-80">%</span>
                  </span>
                </HiddenAmount>
              }
            />
          )}
          <HeroCard
            tone="sun"
            className="snap-start"
            onClick={() => navigate('/transactions')}
            label="This month"
            value={
              blindBudgeting ? (
                '—'
              ) : (
                <HiddenAmount>{formatMoney(monthSpending, currency)}</HiddenAmount>
              )
            }
          />
        </div>

        {/* Upcoming */}
        {upcoming && (
          <section>
            <SectionHeader title="Upcoming" actionLabel="See all" actionTo="/cashflow" />
            <div
              className="flex items-center gap-3 rounded-[1.5rem] bg-card p-4 shadow-[var(--shadow-card)] ring-1 ring-border/50"
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
            </div>
          </section>
        )}

        {/* Penda suggestion */}
        <section>
          <SectionHeader title="Penda says" />
          <button
            type="button"
            onClick={() => (suggestion?.action ? runInsightAction(suggestion.action) : openChat())}
            className="flex w-full items-start gap-3 rounded-[1.5rem] border-2 p-4 text-left transition-transform active:scale-[0.99]"
            style={{
              borderColor: 'var(--iris)',
              background: 'color-mix(in srgb, var(--iris) 8%, var(--card))',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <AiMark className="mt-0.5 size-8 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--iris)' }}>
                Suggestion
              </p>
              <p className="mt-1 text-sm leading-snug text-foreground">
                {suggestion?.text ?? weekInsight}
              </p>
            </div>
          </button>
        </section>

        {/* Recent activity */}
        <section>
          <SectionHeader
            title="Recent activity"
            actionLabel="View all"
            actionTo="/transactions"
          />
          {recent.length === 0 ? (
            <button
              type="button"
              onClick={openAddForm}
              className="w-full rounded-[1.5rem] border border-dashed border-border p-5 text-center text-sm text-muted-foreground"
            >
              No transactions yet — tap to add one
            </button>
          ) : (
            <div className="flex flex-col gap-2.5">
              {recent.map((tx) => {
                const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''
                return (
                  <ActivityRow
                    key={tx.id}
                    onClick={() => {
                      setEditing(tx)
                      setMomoDraft(null)
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

      <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40">
        <div className="mx-auto flex max-w-md items-center justify-end px-4 pb-2">
          <Button
            onClick={openAddForm}
            size="icon"
            className="size-12 shrink-0 rounded-full shadow-[var(--shadow-card)] transition-transform active:scale-95"
            aria-label="Add transaction"
          >
            <Plus className="size-5" />
          </Button>
        </div>
      </div>

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        currency={currency}
        walletId={wallet.id}
        transaction={editing}
        draft={momoDraft}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : undefined}
        isSubmitting={createTransaction.isPending || updateTransaction.isPending}
      />

      <MoMoPasteSheet
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        initialText={pasteInitialText}
        onParsed={(draft) => {
          setPasteOpen(false)
          setEditing(null)
          setMomoDraft(draft)
          setFormOpen(true)
        }}
        onFallbackToAi={(text) => {
          setPasteOpen(false)
          openChat(text)
        }}
      />

      <PaywallSheet feature={paywallFeature} onOpenChange={(open) => !open && setPaywallFeature(null)} />

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
          toast('Paused for 24h — come back tomorrow if you still want it.')
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

      <BottomNav />
    </div>
  )
}
