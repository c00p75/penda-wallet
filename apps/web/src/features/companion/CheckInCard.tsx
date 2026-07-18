import { Button } from '@/components/ui/button'
import { cardAccentClass } from '@/components/ui/cardAccent'
import { cn } from '@/lib/utils'
import type { CompanionCheckin } from './api'

export function CheckInCard({
  checkin,
  busy,
  onRespond,
}: {
  checkin: CompanionCheckin
  busy?: boolean
  onRespond: (status: 'kept' | 'slipped' | 'dismissed' | 'answered') => void
}) {
  const isPact = checkin.kind === 'pact' || checkin.kind === 'impulse'
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-2xl bg-card p-3.5 shadow-[var(--shadow-soft)]',
        cardAccentClass(isPact ? 'mint' : 'iris'),
      )}
    >
      <p className="text-sm leading-snug">{checkin.message}</p>
      <div className="flex flex-wrap gap-2">
        {isPact ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => onRespond('kept')}>
              Kept it
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRespond('slipped')}>
              Slipped
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRespond('dismissed')}>
              Not now
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={busy} onClick={() => onRespond('answered')}>
              Talk about it
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRespond('dismissed')}>
              Dismiss
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
