import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Plus, Ticket, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet'
import { BottomNav } from '@/components/BottomNav'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import {
  useChallenges,
  useCreateChallenge,
  useDeleteChallenge,
  useJoinChallenge,
  useLeaveChallenge,
} from './hooks'
import { ChallengeForm } from './ChallengeForm'
import { ChallengeDetailSheet } from './ChallengeDetailSheet'
import { TYPE_LABELS, daysLeft, formatTarget, hasEnded } from './challengeMeta'
import type { Challenge, ChallengeInput } from './types'

export function ChallengesPage() {
  const session = useAuthStore((s) => s.session)
  const { data: wallet } = useCurrentWallet()

  const { data: challenges = [] } = useChallenges()
  const createChallenge = useCreateChallenge()
  const joinChallenge = useJoinChallenge()
  const leaveChallenge = useLeaveChallenge()
  const deleteChallenge = useDeleteChallenge()

  const [formOpen, setFormOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [selected, setSelected] = useState<Challenge | null>(null)

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const userId = session.user.id
  const active = challenges.filter((c) => !hasEnded(c))
  const ended = challenges.filter((c) => hasEnded(c))

  async function handleCreate(input: ChallengeInput) {
    try {
      await createChallenge.mutateAsync(input)
      toast('Challenge created. Share the invite code to add friends.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!joinCode.trim()) return
    try {
      const challenge = await joinChallenge.mutateAsync(joinCode.trim())
      toast(`Joined "${challenge.name}".`)
      setJoinOpen(false)
      setJoinCode('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not join that challenge.')
    }
  }

  async function handleLeave(challenge: Challenge) {
    try {
      await leaveChallenge.mutateAsync({ challengeId: challenge.id, userId })
      toast(`Left "${challenge.name}".`)
      setSelected(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleDelete(challenge: Challenge) {
    try {
      await deleteChallenge.mutateAsync(challenge.id)
      toast(`Deleted "${challenge.name}".`)
      setSelected(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  function ChallengeCard({ challenge }: { challenge: Challenge }) {
    const over = hasEnded(challenge)
    return (
      <button
        type="button"
        onClick={() => setSelected(challenge)}
        className="flex w-full flex-col gap-1 rounded-lg border p-3 text-left hover:bg-accent"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{challenge.name}</p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {over ? 'Ended' : `${daysLeft(challenge)}d left`}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {TYPE_LABELS[challenge.type]} · {formatTarget(challenge)}
        </p>
      </button>
    )
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 p-4 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Challenges</h1>
        <Button variant="outline" size="sm" onClick={() => setJoinOpen(true)}>
          <Ticket className="size-4" />
          Join with code
        </Button>
      </header>

      {challenges.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Trophy className="size-8" />
          <p className="font-medium">No challenges yet</p>
          <p className="text-sm">
            Create a savings or no-spend challenge and invite friends with a code.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {active.length > 0 && (
            <div className="flex flex-col gap-2">
              {active.map((c) => (
                <ChallengeCard key={c.id} challenge={c} />
              ))}
            </div>
          )}
          {ended.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">Ended</h3>
              {ended.map((c) => (
                <ChallengeCard key={c.id} challenge={c} />
              ))}
            </div>
          )}
        </div>
      )}

      <Button
        onClick={() => setFormOpen(true)}
        size="icon"
        className="fixed bottom-20 right-6 h-14 w-14 rounded-full shadow-lg"
        aria-label="Create challenge"
      >
        <Plus className="size-6" />
      </Button>

      <ChallengeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        currency={wallet.base_currency}
        onSubmit={handleCreate}
        isSubmitting={createChallenge.isPending}
      />

      <Sheet open={joinOpen} onOpenChange={setJoinOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Join a challenge</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleJoin} className="flex flex-col gap-4 px-4 pb-4">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Invite code"
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
            <SheetFooter className="flex-row gap-2 px-0">
              <SheetClose asChild>
                <Button type="button" variant="outline" className="flex-1">
                  Cancel
                </Button>
              </SheetClose>
              <Button type="submit" disabled={joinChallenge.isPending} className="flex-1">
                Join
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ChallengeDetailSheet
        challenge={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        currentUserId={userId}
        onLeave={handleLeave}
        onDelete={handleDelete}
      />

      <BottomNav />
    </main>
  )
}
