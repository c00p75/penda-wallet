import { Button } from '@/components/ui/button'
import { PersonaAvatar } from '@/features/profile/PersonaAvatar'
import type { AiPersonality } from '@/features/profile/types'
import { cn } from '@/lib/utils'
import type { CompanionCheckin } from './api'
import { retargetCheckinMessage } from './checkinMessage'

export function CheckInCard({
  checkin,
  busy,
  onRespond,
  personaName,
  personaValue,
  personaAccent,
}: {
  checkin: CompanionCheckin
  busy?: boolean
  onRespond: (status: 'kept' | 'slipped' | 'dismissed' | 'answered') => void
  personaName: string
  personaValue: AiPersonality
  personaAccent: string
}) {
  const isPact = checkin.kind === 'pact' || checkin.kind === 'impulse'
  const body = retargetCheckinMessage(checkin.message, personaName)

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-2 pl-0.5">
        <PersonaAvatar
          value={personaValue}
          accent={personaAccent}
          size={24}
          className="shrink-0"
        />
        <p className="text-xs font-medium text-muted-foreground">{personaName}</p>
      </div>
      <div
        className={cn(
          'w-full rounded-2xl bg-secondary px-3.5 py-2.5',
          'text-sm shadow-[var(--shadow-soft)] ring-1 ring-border/40',
        )}
      >
        <p className="leading-snug text-foreground">{body}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {isPact ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => onRespond('kept')}>
                Kept it
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => onRespond('slipped')}
              >
                Slipped
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onRespond('dismissed')}
              >
                Not now
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" disabled={busy} onClick={() => onRespond('answered')}>
                Talk about it
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onRespond('dismissed')}
              >
                Dismiss
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
