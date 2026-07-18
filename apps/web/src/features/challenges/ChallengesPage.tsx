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
import { SectionHeader } from '@/components/ui/section-header'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { AiInsight } from '@/components/AiInsight'
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
import { TYPE_ICONS, TYPE_LABELS, daysLeft, formatTarget, hasEnded } from './challengeMeta'
import type { Challenge, ChallengeInput } from './types'

export function ChallengesPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24">
      <AppHeader />
      <section>
        <h1 className="text-[2rem] font-bold tracking-tight leading-tight">Challenges</h1>
        <p className="mt-1 text-sm text-muted-foreground">Compete with friends on savings goals</p>
      </section>
      <ChallengesContent />
      <BottomNav />
    </main>
  )
}

/** The actual challenges UI, shared between the standalone page and the Profile tab-switcher. */
export function ChallengesContent() {
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
    const TypeIcon = TYPE_ICONS[challenge.type]
    return (
      <button
        type="button"
        onClick={() => setSelected(challenge)}
        className="flex w-full items-center gap-3 rounded-[1.35rem] bg-card p-4 text-left shadow-[var(--shadow-soft)] ring-1 ring-border/50 transition-transform active:scale-[0.99]"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--iris-soft)] text-[var(--iris)]">
          <TypeIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{challenge.name}</p>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                background: over ? 'var(--muted)' : 'var(--mint-soft)',
                color: over ? 'var(--muted-foreground)' : 'var(--mint)',
              }}
            >
              {over ? 'Ended' : `${daysLeft(challenge)}d left`}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {TYPE_LABELS[challenge.type]} · {formatTarget(challenge)}
          </p>
        </div>
      </button>
    )
  }

  return (
    <>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => setJoinOpen(true)}>
          <Ticket className="size-4" />
          Join with code
        </Button>
      </div>

      {challenges.length > 0 &&
        (() => {
          const text =
            active.length > 0
              ? (() => {
                  const soonest = Math.min(...active.map((c) => daysLeft(c)))
                  return `${active.length} live challenge${active.length === 1 ? '' : 's'} — ${
                    soonest === 0 ? 'one ends today' : `one ends in ${soonest}d`
                  }. Stay sharp.`
                })()
              : 'Your challenges have wrapped. Ready to start another?'
          return (
            <AiInsight askText={text}>
              {text}
            </AiInsight>
          )
        })()}

      {challenges.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[1.5rem] border border-dashed border-border py-16 text-center text-muted-foreground">
          <span className="grid size-14 place-items-center rounded-2xl bg-[var(--sun-soft)] text-[var(--sun)]">
            <Trophy className="size-7" />
          </span>
          <p className="font-semibold text-foreground">No challenges yet</p>
          <p className="text-sm">
            Create a savings or no-spend challenge and invite friends with a code.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {active.length > 0 && (
            <section>
              <SectionHeader title="Live" />
              <div className="flex flex-col gap-2.5">
                {active.map((c) => (
                  <ChallengeCard key={c.id} challenge={c} />
                ))}
              </div>
            </section>
          )}
          {ended.length > 0 && (
            <section>
              <SectionHeader title="Ended" />
              <div className="flex flex-col gap-2.5">
                {ended.map((c) => (
                  <ChallengeCard key={c.id} challenge={c} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Button
        onClick={() => setFormOpen(true)}
        size="icon"
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-6 h-14 w-14 rounded-full shadow-[var(--shadow-card)] transition-transform active:scale-95"
        aria-label="Create challenge"
      >
        <Plus className="size-6" />
      </Button>

      <ChallengeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        currency={wallet.base_currency}
        walletId={wallet.id}
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
    </>
  )
}
