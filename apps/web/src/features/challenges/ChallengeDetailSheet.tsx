import { Copy, Crown, LogOut, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useLeaderboard } from './hooks'
import { TYPE_LABELS, daysLeft, formatTarget, formatValue, hasEnded, hasMetTarget } from './challengeMeta'
import type { Challenge } from './types'

interface ChallengeDetailSheetProps {
  challenge: Challenge | null
  onOpenChange: (open: boolean) => void
  currentUserId: string
  onLeave: (challenge: Challenge) => void
  onDelete: (challenge: Challenge) => void
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ChallengeDetailSheet({
  challenge,
  onOpenChange,
  currentUserId,
  onLeave,
  onDelete,
}: ChallengeDetailSheetProps) {
  const { data: leaderboard = [], isLoading } = useLeaderboard(challenge?.id)

  if (!challenge) return null

  const isCreator = challenge.creator_id === currentUserId
  const ended = hasEnded(challenge)

  async function copyInviteCode() {
    if (!challenge) return
    await navigator.clipboard.writeText(challenge.invite_code)
    toast('Invite code copied.')
  }

  return (
    <Sheet open={!!challenge} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{challenge.name}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <p>
              {TYPE_LABELS[challenge.type]} · {formatDate(challenge.start_date)} – {formatDate(challenge.end_date)}
              {ended ? ' · Ended' : ` · ${daysLeft(challenge)} days left`}
            </p>
            <p>{formatTarget(challenge)}</p>
          </div>

          <Separator />

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Leaderboard</h3>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">No participants yet.</p>
            ) : (
              <ol className="flex flex-col overflow-hidden rounded-lg border">
                {leaderboard.map((entry, index) => {
                  const isMe = entry.user_id === currentUserId
                  const met = hasMetTarget(challenge, entry.value)
                  return (
                    <li
                      key={entry.user_id}
                      className={`flex items-center justify-between gap-3 border-b p-3 last:border-b-0 ${isMe ? 'bg-accent/50' : ''}`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted-foreground">
                          {index === 0 ? <Crown className="size-4 text-[var(--status-warning)]" /> : index + 1}
                        </span>
                        <p className="truncate text-sm font-medium">
                          {entry.display_name}
                          {isMe && <span className="text-muted-foreground"> (you)</span>}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-medium ${met ? 'text-[var(--status-good)]' : ''}`}
                      >
                        {formatValue(challenge, entry.value)}
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Invite code</p>
              <p className="font-mono text-sm text-muted-foreground">{challenge.invite_code}</p>
            </div>
            <Button variant="outline" size="sm" onClick={copyInviteCode}>
              <Copy className="size-4" />
              Copy
            </Button>
          </div>

          <div className="flex gap-2">
            {isCreator ? (
              <Button variant="destructive" className="flex-1" onClick={() => onDelete(challenge)}>
                <Trash2 className="size-4" />
                Delete challenge
              </Button>
            ) : (
              <Button variant="outline" className="flex-1" onClick={() => onLeave(challenge)}>
                <LogOut className="size-4" />
                Leave challenge
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
