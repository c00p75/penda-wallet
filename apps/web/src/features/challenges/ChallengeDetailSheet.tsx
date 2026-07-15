import { Copy, Crown, LogOut, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Clay3DIcon } from '@/components/Clay'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useLeaderboard } from './hooks'
import { TYPE_CLAY, TYPE_LABELS, daysLeft, formatTarget, formatValue, hasEnded, hasMetTarget } from './challengeMeta'
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
  const clay = TYPE_CLAY[challenge.type]
  const myIndex = leaderboard.findIndex((e) => e.user_id === currentUserId)
  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
  }
  const AVATAR_TINTS = ['var(--iris)', 'var(--apricot)', 'var(--mint)', 'var(--rose)', 'var(--hero-glow)']

  async function copyInviteCode() {
    if (!challenge) return
    await navigator.clipboard.writeText(challenge.invite_code)
    toast('Invite code copied.')
  }

  return (
    <Sheet open={!!challenge} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clay3DIcon name={clay.icon} accent={clay.accent} size={28} />
            {challenge.name}
          </SheetTitle>
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
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Leaderboard</h3>
              {myIndex >= 0 && !ended && (
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ background: 'var(--iris-soft)', color: 'var(--iris)' }}
                >
                  You’re {ordinal(myIndex + 1)} of {leaderboard.length}
                </span>
              )}
            </div>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">No participants yet.</p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {leaderboard.map((entry, index) => {
                  const isMe = entry.user_id === currentUserId
                  const met = hasMetTarget(challenge, entry.value)
                  const tint = AVATAR_TINTS[index % AVATAR_TINTS.length]
                  return (
                    <li
                      key={entry.user_id}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl px-3 py-2.5',
                        !isMe && 'bg-card',
                      )}
                      style={
                        isMe
                          ? { background: 'var(--iris-soft)', boxShadow: '0 0 0 1px var(--iris)' }
                          : undefined
                      }
                    >
                      <span className="grid w-5 shrink-0 place-items-center text-sm font-semibold text-muted-foreground">
                        {index === 0 ? (
                          <Crown className="size-4" style={{ color: 'var(--apricot)' }} />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                        style={{ background: tint }}
                        aria-hidden
                      >
                        {(entry.display_name || '?').slice(0, 1).toUpperCase()}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">
                        {entry.display_name}
                        {isMe && <span className="text-muted-foreground"> (you)</span>}
                      </p>
                      <span
                        className="shrink-0 text-sm font-semibold tabular-nums"
                        style={met ? { color: 'var(--mint)' } : undefined}
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
