import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  CalendarRange,
  Camera,
  ClipboardPaste,
  CloudOff,
  MessageCircle,
  Mic,
  NotebookPen,
  PiggyBank,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet as WalletIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BottomNav } from '@/components/BottomNav'
import { AiInsight, AiOrb } from '@/components/AiInsight'
import { useAuthStore } from '@/store/authStore'
import { enqueueTransaction } from '@/pwa/offlineQueue'
import { useOfflineQueue } from '@/pwa/useOfflineQueue'
import { InstallBanner } from '@/pwa/InstallBanner'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useWalletRealtime } from '@/features/wallets/useWalletRealtime'
import { useWalletPresence } from '@/features/wallets/useWalletPresence'
import { WalletSheet } from '@/features/wallets/WalletSheet'
import { OnboardingScreen } from '@/features/wallets/OnboardingScreen'
import { useBudgetProgress, useBudgets } from '@/features/budgets/hooks'
import { useSavingsGoals } from '@/features/goals/hooks'
import { useProfile } from '@/features/profile/hooks'
import { PersonaAvatar } from '@/features/profile/PersonaAvatar'
import { PERSONALITIES } from '@/features/profile/types'
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
import { useUploadReceipt } from '@/features/receipts/hooks'
import { formatMoney, fromMinorUnits } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { useCategories } from '@/features/categories/hooks'

/** Split a formatted currency string into whole and decimal parts for big-number display. */
function splitBalance(amountMinor: number, currency: string): { whole: string; decimal: string; symbol: string } {
  const formatted = new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
    fromMinorUnits(Math.abs(amountMinor)),
  )
  const symbolMatch = formatted.match(/^([^0-9]*)/)
  const symbol = symbolMatch ? symbolMatch[1].trim() : ''
  const numericPart = formatted.replace(symbol, '').trim()
  const dotIndex = numericPart.lastIndexOf('.')
  if (dotIndex !== -1) {
    return { symbol, whole: numericPart.slice(0, dotIndex), decimal: numericPart.slice(dotIndex) }
  }
  return { symbol, whole: numericPart, decimal: '' }
}

function monthPrefix(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function HomePage() {
  const session = useAuthStore((s) => s.session)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const navigate = useNavigate()
  const openChat = useChatStore((s) => s.openChat)
  const { data: wallet, isLoading: isWalletLoading, wallets } = useCurrentWallet()
  const { data: categories = [] } = useCategories(wallet?.id)
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: budgets = [] } = useBudgets(wallet?.id)
  const { data: budgetProgress = [] } = useBudgetProgress(wallet?.id)
  const { data: goals = [] } = useSavingsGoals(wallet?.id)

  const createTransaction = useCreateTransaction(wallet?.id)
  const updateTransaction = useUpdateTransaction(wallet?.id)
  const deleteTransaction = useDeleteTransaction(wallet?.id)
  const uploadReceipt = useUploadReceipt(wallet?.id)

  const { data: profile } = useProfile(session?.user.id)
  const { isPremium } = useEntitlement(session?.user.id)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [momoDraft, setMomoDraft] = useState<TransactionDraft | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteInitialText, setPasteInitialText] = useState('')
  const [walletSheetOpen, setWalletSheetOpen] = useState(false)
  const [paywallFeature, setPaywallFeature] = useState<PremiumFeature | null>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  useWalletRealtime(wallet?.id)
  const present = useWalletPresence(wallet?.id, session?.user.id, session?.user.email ?? '')
  const offlineQueue = useOfflineQueue()

  function openAddForm() {
    setEditing(null)
    setMomoDraft(null)
    setFormOpen(true)
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
  const personality = profile?.ai_personality ?? 'balanced_coach'
  const personaAccent = PERSONALITIES.find((p) => p.value === personality)?.accent ?? 'var(--iris)'

  // ── Balance & this-month growth ─────────────────────────────
  const balanceMinor = transactions.reduce(
    (sum, tx) => sum + (tx.type === 'income' ? tx.amount_minor : tx.type === 'expense' ? -tx.amount_minor : 0),
    0,
  )
  const now = new Date()
  const thisMonthPrefix = monthPrefix(now)
  const monthName = now.toLocaleDateString(undefined, { month: 'long' })
  const thisMonthTx = transactions.filter((tx) => tx.transaction_date.startsWith(thisMonthPrefix))
  const monthSpending = thisMonthTx
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount_minor, 0)
  const monthIncome = thisMonthTx.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + tx.amount_minor, 0)
  const netThisMonth = monthIncome - monthSpending
  const balanceAtMonthStart = balanceMinor - netThisMonth
  const growthPct =
    balanceAtMonthStart !== 0 ? Math.round((netThisMonth / Math.abs(balanceAtMonthStart)) * 1000) / 10 : null
  const growthPositive = netThisMonth >= 0

  const balanceParts = splitBalance(balanceMinor, currency)
  const isNegative = balanceMinor < 0

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - now.getDate() + 1

  // ── Safe to spend today ─────────────────────────────────────
  const monthlyBudgets = budgetProgress.filter((b) => b.period === 'monthly')
  const totalBudgetMinor = monthlyBudgets.reduce((sum, b) => sum + b.effective_amount_minor, 0)
  const totalSpentMinor = monthlyBudgets.reduce((sum, b) => sum + b.spent_minor, 0)
  const remainingBudgetMinor = totalBudgetMinor - totalSpentMinor
  const hasBudgets = totalBudgetMinor > 0
  const safeToSpendPerDayMinor = Math.max(
    0,
    Math.round((hasBudgets ? remainingBudgetMinor : balanceMinor) / daysLeft),
  )
  const safeToSpendRingPct = hasBudgets
    ? Math.max(0, Math.min(100, Math.round((remainingBudgetMinor / totalBudgetMinor) * 100)))
    : null
  const safeToSpendSubtitle = hasBudgets ? 'Based on your monthly budgets' : 'Based on your current balance'

  // ── Top category this month ─────────────────────────────────
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthPrefix = monthPrefix(prevMonthDate)
  const categoryTotals = new Map<string, { name: string; icon: string | null; amount: number }>()
  for (const tx of thisMonthTx) {
    if (tx.type !== 'expense') continue
    const key = tx.category_id ?? 'uncategorized'
    const existing = categoryTotals.get(key)
    categoryTotals.set(key, {
      name: tx.category?.name ?? 'Uncategorized',
      icon: tx.category?.icon ?? null,
      amount: (existing?.amount ?? 0) + tx.amount_minor,
    })
  }
  const topCategoryEntry = Array.from(categoryTotals.entries()).sort((a, b) => b[1].amount - a[1].amount)[0]
  const topCategory = topCategoryEntry ? { id: topCategoryEntry[0], ...topCategoryEntry[1] } : null
  let topCategoryDeltaPct: number | null = null
  if (topCategory) {
    const prevAmount = transactions
      .filter(
        (tx) =>
          tx.type === 'expense' &&
          tx.transaction_date.startsWith(prevMonthPrefix) &&
          (tx.category_id ?? 'uncategorized') === topCategory.id,
      )
      .reduce((sum, tx) => sum + tx.amount_minor, 0)
    topCategoryDeltaPct = prevAmount > 0 ? Math.round(((topCategory.amount - prevAmount) / prevAmount) * 100) : null
  }

  // ── AI insights ──────────────────────────────────────────────
  const weekCutoff = new Date()
  weekCutoff.setDate(weekCutoff.getDate() - 7)
  const weekCutoffStr = weekCutoff.toISOString().slice(0, 10)
  const last7Spent = transactions
    .filter((tx) => tx.type === 'expense' && tx.transaction_date >= weekCutoffStr)
    .reduce((sum, tx) => sum + tx.amount_minor, 0)
  const weekInsight =
    last7Spent > 0
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

  const suggestions: { icon: React.ElementType; label: string; onTap: () => void }[] = [
    { icon: MessageCircle, label: 'Log an expense', onTap: () => openChat('I spent ') },
    { icon: BarChart3, label: 'This week?', onTap: () => openChat('What did I spend this week?') },
    { icon: PiggyBank, label: 'My budgets', onTap: () => openChat('How are my budgets doing?') },
    { icon: ClipboardPaste, label: 'Paste MoMo', onTap: openPaste },
    { icon: CalendarRange, label: 'Cashflow', onTap: () => navigate('/cashflow') },
    { icon: NotebookPen, label: 'Journal', onTap: () => navigate('/journal') },
    { icon: Sparkles, label: 'What if…', onTap: () => navigate('/simulator') },
    {
      icon: Camera,
      label: 'Scan receipt',
      onTap: () => (isPremium ? receiptInputRef.current?.click() : setPaywallFeature('receipt-scan')),
    },
  ]

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2">
          <Link to="/settings" aria-label="Settings" className="shrink-0 transition-transform active:scale-95">
            <PersonaAvatar value={personality} accent={personaAccent} size={36} />
          </Link>
          <button
            type="button"
            onClick={() => setWalletSheetOpen(true)}
            className="flex items-center gap-2 rounded-full bg-muted py-1.5 pl-3 pr-2.5 text-left"
          >
            <span className="text-sm font-medium">{wallet.name}</span>
            {offlineQueue.pendingCount > 0 && (
              <span
                className="flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground"
                title="Waiting to sync"
              >
                <CloudOff className="size-3" />
                {offlineQueue.pendingCount}
              </span>
            )}
            <span className="flex -space-x-1.5">
              {present.length > 1 ? (
                present.slice(0, 3).map((p) => (
                  <span
                    key={p.userId}
                    title={p.label}
                    className="flex size-5 items-center justify-center rounded-full border-2 border-muted bg-primary text-[9px] font-medium text-primary-foreground"
                  >
                    {p.label.slice(0, 1).toUpperCase()}
                  </span>
                ))
              ) : (
                <Users className="size-4 text-muted-foreground" />
              )}
            </span>
          </button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full"
          onClick={() => openChat()}
          aria-label="Notifications"
        >
          <Bell className="size-4" />
        </Button>
      </header>

      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleReceiptSelected}
      />

      <main className="flex flex-1 flex-col gap-5 px-4 pb-40">
        <InstallBanner />

        <AiInsight>{weekInsight}</AiInsight>

        {/* Quick actions */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {suggestions.map(({ icon: Icon, label, onTap }) => (
            <button
              key={label}
              type="button"
              onClick={onTap}
              className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3.5 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted"
            >
              <Icon className="size-3.5 opacity-70" />
              {label}
            </button>
          ))}
        </div>

        {/* Balance card */}
        <div className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Current balance</p>
              <div className="mt-1 flex items-baseline gap-1">
                {isNegative && <span className="text-2xl font-bold text-[var(--rose)]">−</span>}
                <span className="text-2xl font-bold text-muted-foreground">{balanceParts.symbol}</span>
                <HiddenAmount>
                  <span className="text-4xl font-bold leading-none tracking-tight">{balanceParts.whole}</span>
                  {balanceParts.decimal && (
                    <span className="text-xl font-semibold text-muted-foreground">{balanceParts.decimal}</span>
                  )}
                </HiddenAmount>
              </div>
              {growthPct !== null && (
                <div
                  className="mt-2 flex w-fit items-center gap-1 text-sm font-medium"
                  style={{ color: growthPositive ? 'var(--mint)' : 'var(--rose)' }}
                >
                  {growthPositive ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                  {growthPositive ? '+' : ''}
                  {growthPct}% this month
                </div>
              )}
            </div>
            <span
              className="grid size-11 shrink-0 place-items-center rounded-full"
              style={{ background: 'var(--iris-soft)' }}
            >
              <WalletIcon className="size-5" style={{ color: 'var(--iris)' }} />
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <div>
              <p className="text-xs text-muted-foreground">{monthName} spending</p>
              <p className="font-semibold">
                <HiddenAmount>{formatMoney(monthSpending, currency)}</HiddenAmount>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold tabular-nums">{daysLeft}</p>
              <p className="text-xs text-muted-foreground">days left in {monthName}</p>
            </div>
          </div>
        </div>

        {/* Safe to spend today */}
        <div className="flex items-center justify-between gap-4 rounded-3xl border bg-card p-5 shadow-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--iris)' }}>
              <Sparkles className="size-4" />
              Safe to Spend Today
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              <HiddenAmount>{formatMoney(safeToSpendPerDayMinor, currency)}</HiddenAmount>
              <span className="text-sm font-normal text-muted-foreground"> /day</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{safeToSpendSubtitle}</p>
          </div>
          {safeToSpendRingPct !== null && (
            <div
              className="grid size-16 shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(var(--iris) ${safeToSpendRingPct}%, var(--iris-soft) 0)`,
              }}
            >
              <div className="grid size-12 place-items-center rounded-full bg-card text-sm font-bold tabular-nums">
                {safeToSpendRingPct}%
              </div>
            </div>
          )}
        </div>

        {/* Spending highlights */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Spending Highlights</h2>
            <button
              type="button"
              onClick={() => navigate('/transactions')}
              className="text-sm font-medium text-primary hover:text-primary/80"
            >
              View All
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {topCategory ? (
              <div className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm">
                <span
                  className="grid size-9 place-items-center rounded-full text-base"
                  style={{ background: 'var(--apricot-soft)' }}
                >
                  {topCategory.icon ?? '💳'}
                </span>
                <p className="mt-2 text-xs text-muted-foreground">Top Category</p>
                <p className="truncate font-medium">{topCategory.name}</p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold">
                    <HiddenAmount>{formatMoney(topCategory.amount, currency)}</HiddenAmount>
                  </span>
                  {topCategoryDeltaPct !== null && (
                    <span
                      className="text-xs font-medium"
                      style={{ color: topCategoryDeltaPct >= 0 ? 'var(--rose)' : 'var(--mint)' }}
                    >
                      {topCategoryDeltaPct >= 0 ? '+' : ''}
                      {topCategoryDeltaPct}%
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-2xl border bg-card p-4 text-center text-xs text-muted-foreground">
                No spending yet this month
              </div>
            )}

            <button
              type="button"
              onClick={() => (suggestion?.action ? runInsightAction(suggestion.action) : navigate('/transactions'))}
              className="flex flex-col rounded-2xl border-2 p-4 text-left"
              style={{
                borderColor: 'var(--iris)',
                background: 'color-mix(in srgb, var(--iris) 10%, var(--card))',
              }}
            >
              <AiOrb tone="default" className="size-7" />
              <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--iris)' }}>
                Penda Suggestion
              </p>
              <p className="mt-1 line-clamp-4 text-xs leading-snug">{suggestion?.text ?? weekInsight}</p>
            </button>
          </div>
        </section>

        {/* Savings goals */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your Savings Goals</h2>
            <Link to="/goals" className="text-sm font-medium text-primary hover:text-primary/80">
              See All
            </Link>
          </div>
          {goals.length === 0 ? (
            <button
              type="button"
              onClick={() => navigate('/goals')}
              className="w-full rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground"
            >
              Set a savings goal to start tracking progress
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {goals.slice(0, 2).map((goal, i) => {
                const pct = goal.target_amount_minor > 0 ? goal.current_amount_minor / goal.target_amount_minor : 0
                const remaining = Math.max(0, goal.target_amount_minor - goal.current_amount_minor)
                const accent = i % 2 === 0 ? 'var(--iris)' : 'var(--apricot)'
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => navigate('/goals')}
                    className="flex flex-col rounded-2xl border bg-card p-4 text-left shadow-sm"
                  >
                    <span
                      className="grid size-9 place-items-center rounded-full text-base"
                      style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}
                    >
                      {goal.icon ?? '🎯'}
                    </span>
                    <p className="mt-2 truncate text-sm font-medium">{goal.name}</p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, background: accent }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      <HiddenAmount>{formatMoney(remaining, currency)}</HiddenAmount> left
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {/* ── Floating action bar ───────────────────────────── */}
      <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 pb-2">
          <Button
            onClick={openAddForm}
            size="icon"
            className="size-12 shrink-0 rounded-full shadow-lg"
            aria-label="Add transaction"
          >
            <Plus className="size-5" />
          </Button>
          <button
            type="button"
            onClick={() => openChat()}
            className="flex h-12 flex-1 items-center justify-between rounded-full border bg-card pl-4 pr-1.5 text-left shadow-lg"
            aria-label="Ask Penda"
          >
            <span className="text-sm text-muted-foreground">Ask Penda anything…</span>
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Mic className="size-4" />
            </span>
          </button>
        </div>
      </div>

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        currency={currency}
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

      <WalletSheet open={walletSheetOpen} onOpenChange={setWalletSheetOpen} wallet={wallet} />
      <PaywallSheet feature={paywallFeature} onOpenChange={(open) => !open && setPaywallFeature(null)} />
      <BottomNav />
    </div>
  )
}
