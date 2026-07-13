import { useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Camera, MessageCircle, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase/client'
import { useDefaultWallet } from '@/features/wallets/hooks'
import { useCategories } from '@/features/categories/hooks'
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
import { BalanceSummary } from './BalanceSummary'

export function LedgerPage() {
  const session = useAuthStore((s) => s.session)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const { data: wallet, isLoading: isWalletLoading } = useDefaultWallet()
  const { data: categories = [] } = useCategories(wallet?.id)
  const { data: transactions = [], isLoading: isTransactionsLoading } = useTransactions(wallet?.id)

  const createTransaction = useCreateTransaction(wallet?.id)
  const updateTransaction = useUpdateTransaction(wallet?.id)
  const deleteTransaction = useDeleteTransaction(wallet?.id)
  const uploadReceipt = useUploadReceipt(wallet?.id)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  function openAddForm() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEditForm(tx: Transaction) {
    setEditing(tx)
    setFormOpen(true)
  }

  async function handleSubmit(input: TransactionInput) {
    try {
      if (editing) {
        const wasDraft = editing.source === 'receipt' && !editing.user_confirmed
        await updateTransaction.mutateAsync({ id: editing.id, input })
        toast(wasDraft ? 'Receipt confirmed.' : 'Transaction updated.')
      } else {
        await createTransaction.mutateAsync(input)
        toast('Transaction added.')
      }
    } catch (error) {
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

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Penda</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => receiptInputRef.current?.click()}
            aria-label="Scan a receipt"
            disabled={uploadReceipt.isPending}
          >
            <Camera className="size-5" />
          </Button>
          <input
            ref={receiptInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleReceiptSelected}
          />
          <Button variant="ghost" size="icon" onClick={() => setChatOpen(true)} aria-label="Chat with Penda">
            <MessageCircle className="size-5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </header>

      <BalanceSummary transactions={transactions} currency={wallet.base_currency} />

      {isTransactionsLoading ? null : (
        <TransactionList transactions={transactions} onSelect={openEditForm} />
      )}

      <Button
        onClick={openAddForm}
        size="icon"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg"
        aria-label="Add transaction"
      >
        <Plus className="size-6" />
      </Button>

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

      <ChatSheet open={chatOpen} onOpenChange={setChatOpen} walletId={wallet.id} />

      <p className="text-center text-xs text-muted-foreground">
        Signed in as {session?.user.email}
      </p>
    </div>
  )
}
