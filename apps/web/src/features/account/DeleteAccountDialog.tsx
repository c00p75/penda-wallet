import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase/client'
import { deleteAccount } from './api'

const CONFIRM_WORD = 'DELETE'

export function DeleteAccountDialog() {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleDelete() {
    if (confirmText !== CONFIRM_WORD || busy) return
    setBusy(true)
    try {
      await deleteAccount()
      // Account's gone, clear the local session and send them to login.
      await supabase.auth.signOut()
      window.location.href = '/login'
    } catch (error) {
      setBusy(false)
      toast.error(error instanceof Error ? error.message : 'Could not delete your account.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setConfirmText('')
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-2xl border-[var(--rose)]/30 bg-[var(--rose-soft)]/40 text-[var(--rose)] hover:bg-[var(--rose-soft)]/60">
          Delete account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[var(--rose)]">Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently erases your profile, wallets you solely own, and all their transactions,
            budgets, goals and history. Wallets you share with others stay with them. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5 rounded-2xl border border-[var(--rose)]/20 bg-[var(--rose-soft)]/50 p-4 shadow-[var(--shadow-soft)]">
          <Label htmlFor="confirm-delete">
            Type <span className="font-semibold text-[var(--rose)]">{CONFIRM_WORD}</span> to confirm
          </Label>
          <Input
            id="confirm-delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            placeholder={CONFIRM_WORD}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-2xl border-[var(--rose)]/30 bg-[var(--rose)] text-white hover:bg-[var(--rose)]/90 hover:text-white"
            disabled={confirmText !== CONFIRM_WORD || busy}
            onClick={handleDelete}
          >
            {busy ? 'Deleting…' : 'Permanently delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
