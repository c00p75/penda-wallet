import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { BottomNav } from '@/components/BottomNav'
import { AiInsight } from '@/components/AiInsight'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useCreateMemory, useDeleteMemory, useMemories } from './hooks'
import { relativeTimeLabel } from './relativeTime'

const MOODS = ['😌', '😄', '😰', '😞', '😤', '🤑']

export function JournalPage() {
  const session = useAuthStore((s) => s.session)
  const userId = session?.user.id
  const navigate = useNavigate()
  const { data: wallet } = useCurrentWallet()

  const { data: memories = [] } = useMemories(userId)
  const createMemory = useCreateMemory(userId)
  const deleteMemory = useDeleteMemory(userId)

  const [content, setContent] = useState('')
  const [mood, setMood] = useState<string | null>(null)

  if (!session) return <Navigate to="/login" replace />

  const journal = memories.filter(
    (m) => m.kind === 'note' || m.kind === 'mood' || m.kind === 'fact' || m.kind === 'preference',
  )
  const oldest = journal[journal.length - 1]

  async function handleSave() {
    if (!content.trim()) return
    try {
      await createMemory.mutateAsync({
        wallet_id: wallet?.id ?? null,
        kind: mood ? 'mood' : 'note',
        content: content.trim(),
        mood,
      })
      setContent('')
      setMood(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 bg-background p-4 pb-24">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Journal</h1>
          <p className="text-sm text-muted-foreground">What money feels like, over time</p>
        </div>
      </header>

      {oldest && (
        <AiInsight>
          {relativeTimeLabel(oldest.created_at)} you wrote: “{oldest.content}”. Look how far you’ve come.
        </AiInsight>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(mood === m ? null : m)}
              aria-pressed={mood === m}
              className={cn(
                'flex size-10 items-center justify-center rounded-full border text-xl',
                mood === m ? 'border-primary bg-accent' : 'border-transparent bg-muted',
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="I stress-buy after work. Payday felt like relief."
        />
        <Button onClick={handleSave} disabled={!content.trim() || createMemory.isPending} className="self-end">
          Add to journal
        </Button>
      </div>

      {journal.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nothing here yet. Noting how a purchase felt helps Penda spot your patterns.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {journal.map((m) => (
            <li key={m.id} className="flex items-start gap-3 rounded-2xl border bg-card p-3">
              <span className="text-xl" aria-hidden>
                {m.mood ?? '📝'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{relativeTimeLabel(m.created_at)}</p>
                <p className="text-sm">{m.content}</p>
              </div>
              <button
                type="button"
                onClick={() => deleteMemory.mutate(m.id)}
                aria-label="Delete entry"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}

      <BottomNav />
    </main>
  )
}
