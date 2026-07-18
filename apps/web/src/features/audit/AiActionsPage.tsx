import { Navigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowCounterClockwise } from '@/components/icons/product'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ActivityRow } from '@/components/ui/activity-row'
import { SectionHeader } from '@/components/ui/section-header'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { canUndoAiAction, fetchAiPendingActions, undoAiAction } from './api'

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function AiActionsPage() {
  const session = useAuthStore((s) => s.session)
  const userId = session?.user.id
  const queryClient = useQueryClient()

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ['ai-pending-actions', userId],
    queryFn: () => fetchAiPendingActions(userId!),
    enabled: !!userId,
  })

  if (!session) return <Navigate to="/login" replace />

  async function handleUndo(action: (typeof actions)[number]) {
    if (!userId) return
    try {
      await undoAiAction(action, userId)
      toast('Undone. AI confirmations are required again.')
      await queryClient.invalidateQueries({ queryKey: ['transactions'] })
      await queryClient.invalidateQueries({ queryKey: ['budgets'] })
      await queryClient.invalidateQueries({ queryKey: ['savings-goals'] })
      await queryClient.invalidateQueries({ queryKey: ['debts'] })
      await queryClient.invalidateQueries({ queryKey: ['categories'] })
      await queryClient.invalidateQueries({ queryKey: ['ai-pending-actions', userId] })
      await queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not undo.')
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader title="AI actions" subtitle="What Penda proposed — and how it resolved" />

      {isLoading ? null : actions.length === 0 ? (
        <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No staged AI actions yet. Updates and deletes always land here first.
        </p>
      ) : (
        <section>
          <SectionHeader title="Recent actions" />
          <div className="flex flex-col gap-2.5">
            {actions.map((a) => {
              const canUndo = canUndoAiAction(a)
              return (
                <ActivityRow
                  key={a.id}
                  avatar={
                    <span className="text-xs font-bold uppercase text-muted-foreground">
                      {a.kind.slice(0, 1)}
                    </span>
                  }
                  title={a.summary}
                  subtitle={
                    <>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize">
                        {a.status}
                      </span>
                      <span className="mx-1">·</span>
                      <span className="capitalize">
                        {a.kind} · {a.domain}
                      </span>
                      <span className="mx-1">·</span>
                      {relativeTime(a.created_at)}
                    </>
                  }
                  action={
                    canUndo ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 rounded-full"
                        onClick={() => handleUndo(a)}
                      >
                        <ArrowCounterClockwise className="size-3.5" weight="bold" />
                        Undo
                      </Button>
                    ) : undefined
                  }
                />
              )
            })}
          </div>
        </section>
      )}

      <BottomNav />
    </main>
  )
}
