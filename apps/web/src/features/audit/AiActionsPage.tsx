import { Link, Navigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ActivityRow } from '@/components/ui/activity-row'
import { SectionHeader } from '@/components/ui/section-header'
import { BottomNav } from '@/components/BottomNav'
import { useAuthStore } from '@/store/authStore'
import { fetchAiPendingActions, undoSoftDeletedTransaction } from './api'

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

  async function handleUndo(targetId: string) {
    try {
      await undoSoftDeletedTransaction(targetId)
      toast('Transaction restored.')
      await queryClient.invalidateQueries({ queryKey: ['transactions'] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not undo.')
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24">
      <header className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 rounded-2xl bg-card shadow-[var(--shadow-soft)] ring-1 ring-border/50"
          asChild
        >
          <Link to="/settings" aria-label="Back to settings">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-[2rem] font-bold tracking-tight leading-tight">AI actions</h1>
          <p className="text-sm text-muted-foreground">What Penda proposed — and how it resolved</p>
        </div>
      </header>

      {isLoading ? null : actions.length === 0 ? (
        <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No staged AI actions yet. Updates and deletes always land here first.
        </p>
      ) : (
        <section>
          <SectionHeader title="Recent actions" />
          <div className="flex flex-col gap-2.5">
            {actions.map((a) => {
              const canUndo = a.status === 'confirmed' && a.kind === 'delete' && a.domain === 'transaction'
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
                        onClick={() => handleUndo(a.target_id)}
                      >
                        <Undo2 className="size-3.5" />
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
