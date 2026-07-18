import {
  BellRinging,
  CalendarBlank,
  Lightbulb,
  Sparkle,
  TrendDown,
  type Icon,
} from '@/components/icons/product'
import { ActivityRow } from '@/components/ui/activity-row'
import { cn } from '@/lib/utils'
import type { AppNotification, NotificationKind } from './types'

const KIND_META: Record<
  NotificationKind,
  { icon: Icon; label: string; soft: string; ink: string }
> = {
  tip: {
    icon: Lightbulb,
    label: 'Tip',
    soft: 'color-mix(in srgb, var(--apricot) 22%, transparent)',
    ink: 'var(--apricot)',
  },
  reminder: {
    icon: CalendarBlank,
    label: 'Reminder',
    soft: 'var(--iris-soft)',
    ink: 'var(--iris)',
  },
  insight: {
    icon: Sparkle,
    label: 'Insight',
    soft: 'color-mix(in srgb, var(--mint) 22%, transparent)',
    ink: 'var(--mint)',
  },
  alert: {
    icon: TrendDown,
    label: 'Alert',
    soft: 'color-mix(in srgb, var(--rose) 18%, transparent)',
    ink: 'var(--rose)',
  },
  update: {
    icon: BellRinging,
    label: 'Update',
    soft: 'var(--muted)',
    ink: 'var(--foreground)',
  },
}

interface NotificationRowProps {
  notification: AppNotification
  onOpen: (n: AppNotification) => void
  onArchive: (id: string) => void
}

export function NotificationRow({ notification, onOpen, onArchive }: NotificationRowProps) {
  const meta = KIND_META[notification.kind]
  const Glyph = meta.icon
  const unread = !notification.read_at

  return (
    <div className="group relative">
      <ActivityRow
        onClick={() => onOpen(notification)}
        className={cn(unread && 'ring-[var(--iris)]/30')}
        avatar={
          <span
            className="grid size-full place-items-center"
            style={{ background: meta.soft, color: meta.ink }}
          >
            <Glyph className="size-4" weight="duotone" />
          </span>
        }
        title={
          <span className="flex items-center gap-2">
            {unread && (
              <span className="size-1.5 shrink-0 rounded-full bg-[var(--iris)]" aria-hidden />
            )}
            <span className={cn(unread && 'font-bold')}>{notification.title}</span>
          </span>
        }
        subtitle={
          <>
            <span className="font-medium text-foreground/80">{meta.label}</span>
            {' · '}
            {notification.body}
          </>
        }
        showChevron
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onArchive(notification.id)
        }}
        className="absolute top-2 right-2 rounded-full px-2 py-1 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100"
        aria-label="Archive notification"
      >
        Archive
      </button>
    </div>
  )
}
