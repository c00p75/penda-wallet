import { Link, Navigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 bg-background p-4 pb-24">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full" asChild>
          <Link to="/settings" aria-label="Back to settings">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">AI actions</h1>
          <p className="text-sm text-muted-foreground">What Penda proposed — and how it resolved</p>
        </div>
      </header>

      {isLoading ? null : actions.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No staged AI actions yet. Updates and deletes always land here first.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {actions.map((a) => {
            const canUndo = a.status === 'confirmed' && a.kind === 'delete' && a.domain === 'transaction'
            return (
              <li key={a.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug">{a.summary}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(a.created_at)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium capitalize">{a.status}</span>
                  <span className="capitalize">
                    {a.kind} · {a.domain}
                  </span>
                </div>
                {canUndo && (
                  <Button size="sm" variant="outline" className="self-start gap-1.5" onClick={() => handleUndo(a.target_id)}>
                    <Undo2 className="size-3.5" />
                    Undo delete
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <BottomNav />
    </main>
  )
}
