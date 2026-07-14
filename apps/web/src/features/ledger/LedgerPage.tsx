import { useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  BarChart3,
  Camera,
  CloudOff,
  MessageCircle,
  Mic,
  PiggyBank,
  Plus,
  Settings,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BottomNav } from '@/components/BottomNav'
import { useAuthStore } from '@/store/authStore'
import { enqueueTransaction } from '@/pwa/offlineQueue'
import { useOfflineQueue } from '@/pwa/useOfflineQueue'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useWalletRealtime } from '@/features/wallets/useWalletRealtime'
import { useWalletPresence } from '@/features/wallets/useWalletPresence'
import { WalletSheet } from '@/features/wallets/WalletSheet'
import { useCategories } from '@/features/categories/hooks'
import { useProfile } from '@/features/profile/hooks'
import { useEntitlement } from '@/features/entitlements/hooks'
import { PaywallSheet } from '@/features/entitlements/PaywallSheet'
import type { PremiumFeature } from '@/features/entitlements/types'
import {
  useCreateTransaction,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from '@/features/transactions/hooks'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import { TransactionList } from '@/features/transactions/TransactionList'
import type { Transaction, TransactionInput } from '@/features/transactions/types'
import { ChatSheet } from '@/features/chat/ChatSheet'
import { useUploadReceipt } from '@/features/receipts/hooks'
import { AiInsight } from '@/components/AiInsight'
import { formatMoney } from '@/lib/money'
import { BalanceSummary } from './BalanceSummary'

export function LedgerPage() {
  const session = useAuthStore((s) => s.session)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const { data: wallet, isLoading: isWalletLoading } = useCurrentWallet()
  const { data: categories = [] } = useCategories(wallet?.id)
  const { data: transactions = [], isLoading: isTransactionsLoading } = useTransactions(wallet?.id)

  const createTransaction = useCreateTransaction(wallet?.id)
  const updateTransaction = useUpdateTransaction(wallet?.id)
  const deleteTransaction = useDeleteTransaction(wallet?.id)
  const uploadReceipt = useUploadReceipt(wallet?.id)

  const { data: profile } = useProfile(session?.user.id)
  const { isPremium } = useEntitlement(session?.user.id)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatPrefill, setChatPrefill] = useState('')
  const [walletSheetOpen, setWalletSheetOpen] = useState(false)
  const [paywallFeature, setPaywallFeature] = useState<PremiumFeature | null>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  useWalletRealtime(wallet?.id)
  const present = useWalletPresence(wallet?.id, session?.user.id, session?.user.email ?? '')
  const offlineQueue = useOfflineQueue()

  function openAddForm() {
    setEditing(null)
    setFormOpen(true)
  }

  function openChat(prefill = '') {
    setChatPrefill(prefill)
    setChatOpen(true)
  }

  function openEditForm(tx: Transaction) {
    setEditing(tx)
    setFormOpen(true)
  }

  async function saveOffline(input: TransactionInput) {
    if (!wallet || !session) return
    await enqueueTransaction(wallet.id, session.user.id, input)
    await offlineQueue.refreshCount()
    toast("Saved offline — it'll sync when you're back online.")
  }

  async function handleSubmit(input: TransactionInput) {
    // Queue new entries immediately when offline rather than letting the
    // request hang on the auth lock until reconnect. Edits are never queued:
    // they carry a version check that must run against the live row.
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
      // Fallback for a network that broke without navigator.onLine noticing.
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

  if (isAuthLoading) {
    return null
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (isWalletLoading || !wallet) {
    return null
  }

  const firstName = profile?.display_name?.split(' ')[0]

  // AI speaks first: a grounded read of the last 7 days from real transactions.
  const weekCutoff = new Date()
  weekCutoff.setDate(weekCutoff.getDate() - 7)
  const weekCutoffStr = weekCutoff.toISOString().slice(0, 10)
  const last7Spent = transactions
    .filter((tx) => tx.type === 'expense' && tx.transaction_date >= weekCutoffStr)
    .reduce((sum, tx) => sum + tx.amount_minor, 0)
  const weekInsight =
    last7Spent > 0
      ? `You’ve spent ${formatMoney(last7Spent, wallet.base_currency)} in the last 7 days.`
      : 'Nothing logged this week yet — tell me about a purchase and I’ll take it from there.'

  const suggestions: { icon: React.ElementType; label: string; onTap: () => void }[] = [
    { icon: MessageCircle, label: 'Log an expense', onTap: () => openChat('I spent ') },
    {
      icon: Camera,
      label: 'Scan a receipt',
      onTap: () => (isPremium ? receiptInputRef.current?.click() : setPaywallFeature('receipt-scan')),
    },
    { icon: BarChart3, label: 'What did I spend this week?', onTap: () => openChat('What did I spend this week?') },
    { icon: PiggyBank, label: 'How are my budgets?', onTap: () => openChat('How are my budgets doing?') },
  ]

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4 pb-36">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setWalletSheetOpen(true)}
          className="flex items-center gap-2 rounded-full border bg-card py-1.5 pl-3 pr-2 text-left shadow-xs"
        >
          <span className="text-sm font-medium">{wallet.name}</span>
          {offlineQueue.pendingCount > 0 && (
            <span
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
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
                  className="flex size-5 items-center justify-center rounded-full border-2 border-background bg-primary text-[9px] font-medium text-primary-foreground"
                >
                  {p.label.slice(0, 1).toUpperCase()}
                </span>
              ))
            ) : (
              <Users className="size-4 text-muted-foreground" />
            )}
          </span>
        </button>
        <input
          ref={receiptInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleReceiptSelected}
        />
        <Button variant="ghost" size="icon" className="rounded-full border bg-card shadow-xs" asChild>
          <Link to="/settings" aria-label="Settings">
            <Settings className="size-5" />
          </Link>
        </Button>
      </header>

      <section
        className="flex flex-col gap-5 rounded-3xl p-5 pt-7"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 110%, var(--hero-glow) -40%, transparent 60%), linear-gradient(180deg, var(--hero-from) 0%, var(--hero-via) 60%, var(--hero-to) 100%)',
        }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="rounded-full bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            AI money assistant
          </span>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">
            Hello{firstName ? ` ${firstName}` : ''},
            <br />
            how can I help today?
          </h1>
        </div>

        <BalanceSummary transactions={transactions} currency={wallet.base_currency} />
      </section>

      <AiInsight>{weekInsight}</AiInsight>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {suggestions.map(({ icon: Icon, label, onTap }) => (
          <button
            key={label}
            type="button"
            onClick={onTap}
            className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3.5 py-2 text-sm font-medium shadow-xs hover:bg-accent"
          >
            <Icon className="size-4 text-primary" />
            {label}
          </button>
        ))}
      </div>

      {isTransactionsLoading ? null : (
        <TransactionList transactions={transactions} onSelect={openEditForm} />
      )}

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
        currency={wallet.base_currency}
        transaction={editing}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : undefined}
        isSubmitting={createTransaction.isPending || updateTransaction.isPending}
      />

      <ChatSheet
        open={chatOpen}
        onOpenChange={setChatOpen}
        walletId={wallet.id}
        initialInput={chatPrefill}
        isVoicePremium={isPremium}
        onRequireVoicePremium={() => setPaywallFeature('voice')}
      />

      <WalletSheet open={walletSheetOpen} onOpenChange={setWalletSheetOpen} wallet={wallet} />

      <PaywallSheet feature={paywallFeature} onOpenChange={(open) => !open && setPaywallFeature(null)} />

      <BottomNav />
    </main>
  )
}
