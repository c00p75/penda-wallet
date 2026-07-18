import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { SectionHeader } from '@/components/ui/section-header'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { NotificationRow } from './NotificationRow'
import {
  useArchiveNotification,
  useMarkNotificationsRead,
  useNotifications,
} from './hooks'
import { groupNotificationsByDay } from './prefs'
import type { AppNotification, NotificationFilter, NotificationKind } from './types'

const FILTERS: { id: NotificationFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'reminder', label: 'Reminders' },
  { id: 'tip', label: 'Tips' },
  { id: 'insight', label: 'Insights' },
  { id: 'alert', label: 'Alerts' },
]

function matchesFilter(n: AppNotification, filter: NotificationFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'unread') return !n.read_at
  return n.kind === (filter as NotificationKind)
}

export function NotificationsPage() {
  const session = useAuthStore((s) => s.session)
  const navigate = useNavigate()
  const { data: notifications = [], isLoading } = useNotifications()
  const markRead = useMarkNotificationsRead()
  const archive = useArchiveNotification()
  const [filter, setFilter] = useState<NotificationFilter>('all')

  const filtered = useMemo(
    () => notifications.filter((n) => matchesFilter(n, filter)),
    [notifications, filter],
  )
  const groups = useMemo(() => groupNotificationsByDay(filtered), [filtered])
  const unreadCount = notifications.filter((n) => !n.read_at).length

  if (!session) return <Navigate to="/login" replace />

  async function handleOpen(n: AppNotification) {
    if (!n.read_at) {
      try {
        await markRead.mutateAsync([n.id])
      } catch {
        // Navigation still proceeds — unread can be cleared later.
      }
    }
    navigate(n.href || '/notifications')
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader
        title="Notifications"
        subtitle="Reminders, tips, and updates"
        trailing={
          unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-xs"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(undefined)}
            >
              Mark all read
            </Button>
          ) : null
        }
      />

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              filter === f.id
                ? 'bg-[var(--iris)] text-white'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {filter === 'unread'
            ? 'You’re all caught up — no unread alerts.'
            : 'No notifications yet. Budget alerts, bill reminders, and tips will show up here.'}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.label}>
            <SectionHeader title={group.label} />
            <div className="flex flex-col gap-2.5">
              {group.items.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onOpen={handleOpen}
                  onArchive={(id) => archive.mutate(id)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <BottomNav />
    </main>
  )
}
