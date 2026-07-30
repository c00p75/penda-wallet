import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
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
import { useAuthStore } from '@/store/authStore'
import { profileKey } from '@/features/profile/hooks'
import type { Profile } from '@/features/profile/types'
import { confirmAccountDeletion, restoreAccount } from './api'

const CONFIRM_WORD = 'DELETE'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Blocks the app for an account mid-grace-period (see DeleteAccountDialog). */
export function RestoreAccountScreen({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.session?.user.id)
  const [restoring, setRestoring] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  async function handleRestore() {
    setRestoring(true)
    try {
      await restoreAccount()
      await queryClient.invalidateQueries({ queryKey: profileKey(userId) })
      toast('Welcome back — your account has been restored.')
    } catch (error) {
      setRestoring(false)
      toast.error(error instanceof Error ? error.message : 'Could not restore your account.')
    }
  }

  async function handleDeleteNow() {
    if (confirmText !== CONFIRM_WORD || deleting) return
    setDeleting(true)
    try {
      await confirmAccountDeletion()
      await supabase.auth.signOut()
      window.location.href = '/login'
    } catch (error) {
      setDeleting(false)
      toast.error(error instanceof Error ? error.message : 'Could not delete your account.')
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 bg-background px-6 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your account is scheduled for deletion</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything will be permanently erased on {formatDate(profile.scheduled_deletion_at!)}.
          Restore your account to keep using Penda, or delete it now instead.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Button onClick={handleRestore} disabled={restoring}>
          {restoring ? 'Restoring…' : 'Restore my account'}
        </Button>
        <Dialog
          open={confirmOpen}
          onOpenChange={(next) => {
            setConfirmOpen(next)
            if (!next) setConfirmText('')
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="rounded-2xl border-[var(--rose)]/30 bg-[var(--rose-soft)]/40 text-[var(--rose)] hover:bg-[var(--rose-soft)]/60"
            >
              Delete now instead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-[var(--rose)]">Delete your account now?</DialogTitle>
              <DialogDescription>
                This skips the rest of the grace period and permanently erases your profile, wallets
                you solely own, and all their transactions, budgets, goals and history right away.
                This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5 rounded-2xl border border-[var(--rose)]/20 bg-[var(--rose-soft)]/50 p-4 shadow-[var(--shadow-soft)]">
              <Label htmlFor="confirm-delete-now">
                Type <span className="font-semibold text-[var(--rose)]">{CONFIRM_WORD}</span> to confirm
              </Label>
              <Input
                id="confirm-delete-now"
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
                disabled={confirmText !== CONFIRM_WORD || deleting}
                onClick={handleDeleteNow}
              >
                {deleting ? 'Deleting…' : 'Permanently delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}
