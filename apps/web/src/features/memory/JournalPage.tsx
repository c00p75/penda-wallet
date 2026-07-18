import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ActivityRow } from '@/components/ui/activity-row'
import { SectionHeader } from '@/components/ui/section-header'
import { BottomNav } from '@/components/BottomNav'
import { AiInsight } from '@/components/AiInsight'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useCreateMemory, useDeleteMemory, useMemories } from './hooks'
import { relativeTimeLabel } from './relativeTime'
import type { AiMemory } from './types'

const MOODS = ['😌', '😄', '😰', '😞', '😤', '🤑']
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

function monthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

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

  const journal = useMemo(
    () =>
      memories.filter(
        (m) => m.kind === 'note' || m.kind === 'mood' || m.kind === 'fact' || m.kind === 'preference',
      ),
    [memories],
  )

  const oneYearAgo = useMemo(() => {
    const cutoff = Date.now() - YEAR_MS
    return journal
      .filter((m) => new Date(m.created_at).getTime() <= cutoff)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  }, [journal])

  const byMonth = useMemo(() => {
    const map = new Map<string, AiMemory[]>()
    for (const m of journal) {
      const key = monthKey(m.created_at)
      const list = map.get(key) ?? []
      list.push(m)
      map.set(key, list)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [journal])

  if (!session) return <Navigate to="/login" replace />

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

  const oldest = journal[journal.length - 1]

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24">
      <header className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 rounded-2xl bg-card shadow-[var(--shadow-soft)] ring-1 ring-border/50"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-[2rem] font-bold tracking-tight leading-tight">Journal</h1>
          <p className="text-sm text-muted-foreground">What money feels like, over time</p>
        </div>
      </header>

      {oneYearAgo ? (
        <AiInsight tone="warm">
          One year ago you wrote: "{oneYearAgo.content}". Look how far you've come.
        </AiInsight>
      ) : (
        oldest && (
          <AiInsight>
            {relativeTimeLabel(oldest.created_at)} you wrote: "{oldest.content}". Look how far you've come.
          </AiInsight>
        )
      )}

      <div className="flex flex-col gap-3 rounded-[1.5rem] bg-card p-4 shadow-[var(--shadow-card)] ring-1 ring-border/50">
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(mood === m ? null : m)}
              aria-pressed={mood === m}
              className={cn(
                'flex size-10 items-center justify-center rounded-full border text-xl transition-colors',
                mood === m ? 'border-primary bg-[var(--iris-soft)]' : 'border-transparent bg-muted',
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
          className="rounded-2xl border-border/60 bg-background"
        />
        <Button onClick={handleSave} disabled={!content.trim() || createMemory.isPending} className="self-end rounded-full">
          Add to journal
        </Button>
      </div>

      {journal.length === 0 ? (
        <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing here yet. Noting how a purchase felt helps Penda spot your patterns.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {byMonth.map(([key, entries]) => (
            <section key={key}>
              <SectionHeader title={monthLabel(key)} className="mb-2" />
              <div className="flex flex-col gap-2.5">
                {entries.map((m) => (
                  <ActivityRow
                    key={m.id}
                    avatar={<span>{m.mood ?? '📝'}</span>}
                    title={m.content}
                    subtitle={relativeTimeLabel(m.created_at)}
                    action={
                      <button
                        type="button"
                        onClick={() => deleteMemory.mutate(m.id)}
                        aria-label="Delete entry"
                        className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--rose-soft)] hover:text-[var(--rose)]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <BottomNav />
    </main>
  )
}
