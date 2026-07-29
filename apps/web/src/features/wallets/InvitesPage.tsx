import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { relativeTimeLabel } from '@/features/memory/relativeTime'
import { useAcceptWalletInvite, useDeclineWalletInvite, useMyWalletInvites } from './hooks'

const PREMIUM_REQUIRED_PREFIX = 'PREMIUM_REQUIRED:'

function stripPrefix(message: string): string {
  return message.startsWith(PREMIUM_REQUIRED_PREFIX)
    ? message.slice(PREMIUM_REQUIRED_PREFIX.length).trim()
    : message
}

/** Invitee-facing: accept/decline pending shared-wallet invites addressed to me. */
export function InvitesPage() {
  const session = useAuthStore((s) => s.session)
  const { data: invites = [], isLoading } = useMyWalletInvites()
  const acceptInvite = useAcceptWalletInvite()
  const declineInvite = useDeclineWalletInvite()

  if (!session) return <Navigate to="/login" replace />

  async function handleAccept(id: string, walletName: string) {
    try {
      await acceptInvite.mutateAsync(id)
      toast(`Joined ${walletName}. Switch to it from the account picker.`)
    } catch (error) {
      toast.error(stripPrefix(error instanceof Error ? error.message : 'Could not accept that invite.'))
    }
  }

  async function handleDecline(id: string) {
    try {
      await declineInvite.mutateAsync(id)
      toast('Invite declined.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader title="Invites" subtitle="Money accounts shared with you" />

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : invites.length === 0 ? (
        <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No pending invites. When someone invites you to a shared money account, it'll show up
          here.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-secondary/30 p-4 shadow-[var(--shadow-soft)]"
            >
              <div>
                <p className="font-medium">{invite.wallet_name}</p>
                <p className="text-xs text-muted-foreground">
                  {invite.invited_by_name} invited you as{' '}
                  {invite.role === 'editor' ? 'an editor' : 'a viewer (coach / advisor)'} ·{' '}
                  {relativeTimeLabel(invite.created_at).toLowerCase()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={acceptInvite.isPending || declineInvite.isPending}
                  onClick={() => handleAccept(invite.id, invite.wallet_name)}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={acceptInvite.isPending || declineInvite.isPending}
                  onClick={() => handleDecline(invite.id)}
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BottomNav />
    </main>
  )
}
