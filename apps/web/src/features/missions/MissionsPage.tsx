import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, MoreVertical, X } from 'lucide-react'
import { Path, Sparkle } from '@/components/icons/product'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { HeroCard } from '@/components/ui/hero-card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SectionHeader } from '@/components/ui/section-header'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { AiInsight } from '@/components/AiInsight'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { cn } from '@/lib/utils'
import {
  useArchivedMissions,
  useArchiveMission,
  useCreateMission,
  useGenerateMissions,
  useMissions,
  useUnarchiveMission,
  useUpdateMissionStatus,
} from './hooks'
import { MissionForm } from './MissionForm'
import { suggestMissions, type SuggestedMission } from './suggestMissions'
import type { FinancialMissionInput, MissionStatus } from './types'

const STATUS_CYCLE: MissionStatus[] = ['active', 'kept', 'broken', 'dismissed']

const STATUS_STYLE: Record<MissionStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'var(--iris)' },
  kept: { label: 'Kept', color: 'var(--mint)' },
  broken: { label: 'Broken', color: 'var(--rose)' },
  dismissed: { label: 'Dismissed', color: 'var(--muted-foreground)' },
}

function MissionOverflowMenu({
  disabled,
  onArchive,
}: {
  disabled?: boolean
  onArchive: () => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Mission options"
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <MoreVertical className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 gap-0 p-1.5">
        <button
          type="button"
          className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted"
          onClick={() => {
            setOpen(false)
            void onArchive()
          }}
        >
          Archive mission
        </button>
      </PopoverContent>
    </Popover>
  )
}

export function MissionsPage() {
  const session = useAuthStore((s) => s.session)
  const userId = session?.user.id
  const { data: wallet } = useCurrentWallet()
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: missions = [] } = useMissions(wallet?.id)
  const { data: archivedMissions = [] } = useArchivedMissions(wallet?.id)
  const createMission = useCreateMission(wallet?.id, userId)
  const updateStatus = useUpdateMissionStatus(wallet?.id)
  const archiveMission = useArchiveMission(wallet?.id)
  const unarchiveMission = useUnarchiveMission(wallet?.id)
  const generateMissions = useGenerateMissions(wallet?.id)
  const [formOpen, setFormOpen] = useState(false)

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const normTitle = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

  /** First idea whose title isn't already one of the user's missions. */
  function pickNovel(ideas: SuggestedMission[]): SuggestedMission | undefined {
    const existing = new Set(missions.map((m) => normTitle(m.title)))
    return ideas.find((idea) => !existing.has(normTitle(idea.title))) ?? ideas[0]
  }

  async function handleSuggest() {
    let ideas: SuggestedMission[] = []
    try {
      // Fresh, AI-written missions from this wallet's goals + spending, so each
      // tap is unique rather than the old fixed template.
      ideas = await generateMissions.mutateAsync()
    } catch (error) {
      // A real failure (e.g. rate limit) surfaces its message; then we still
      // fall back to the local starter ideas below so suggest always works.
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
    if (ideas.length === 0) ideas = suggestMissions(transactions)

    const idea = pickNovel(ideas)
    if (!idea) {
      toast('Need a bit more spending history before I can suggest a mission.')
      return
    }
    try {
      await createMission.mutateAsync(idea)
      toast(`Mission added: ${idea.title}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function cycleStatus(id: string, current: MissionStatus) {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length]
    try {
      await updateStatus.mutateAsync({ id, status: next })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleCreate(input: FinancialMissionInput) {
    try {
      await createMission.mutateAsync(input)
      toast(`Mission added: ${input.title}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleArchive(id: string, title: string) {
    try {
      await archiveMission.mutateAsync(id)
      toast(`Archived "${title}".`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleUnarchive(id: string, title: string) {
    try {
      await unarchiveMission.mutateAsync(id)
      toast(`Restored "${title}".`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  const active = missions.filter((m) => m.status === 'active')

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader title="Missions" subtitle="Small commitments that compound" />

      <HeroCard tone="iris" className="w-full min-h-[7.5rem]">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-white/20">
            <Path className="size-6" weight="duotone" />
          </span>
          <div>
            <p className="text-sm font-medium text-white/85">Active missions</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{active.length}</p>
          </div>
        </div>
      </HeroCard>

      <AiInsight featured>
        {active.length > 0
          ? `You're on ${active.length} active mission${active.length === 1 ? '' : 's'}. Small commitments compound.`
          : 'Missions are short, concrete challenges, five no-spend days, cook at home this week. Want one?'}
      </AiInsight>

      <div className="flex gap-2">
        <Button
          onClick={handleSuggest}
          disabled={createMission.isPending || generateMissions.isPending}
          className="flex-1 gap-1.5 rounded-full"
        >
          <Sparkle className="size-4" weight="fill" />
          {generateMissions.isPending ? 'Thinking of one…' : 'Suggest a mission'}
        </Button>
        <Button variant="outline" className="rounded-full" onClick={() => setFormOpen(true)}>
          New mission
        </Button>
      </div>

      {missions.length === 0 ? (
        <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No missions yet. Tap suggest and I'll pick one from your spending, or add your own.
        </p>
      ) : (
        <section>
          <SectionHeader title="Your missions" />
          <ul className="flex flex-col gap-2.5">
            {missions.map((m) => {
              const style = STATUS_STYLE[m.status]
              return (
                <li
                  key={m.id}
                  className="flex flex-col gap-2 rounded-[1.35rem] bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--iris-soft)] text-[var(--iris)]">
                      <Path className="size-4" weight="duotone" />
                    </span>
                    <p className="min-w-0 flex-1 truncate font-semibold">{m.title}</p>
                    <button
                      type="button"
                      onClick={() => cycleStatus(m.id, m.status)}
                      className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold')}
                      style={{
                        background: `color-mix(in srgb, ${style.color} 16%, transparent)`,
                        color: style.color,
                      }}
                    >
                      {style.label}
                    </button>
                    {(m.status === 'kept' || m.status === 'broken') && (
                      <MissionOverflowMenu
                        disabled={archiveMission.isPending}
                        onArchive={() => handleArchive(m.id, m.title)}
                      />
                    )}
                  </div>
                  {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
                  <p className="text-xs text-muted-foreground">
                    {m.start_date} → {m.end_date}
                  </p>
                  {m.status === 'active' && (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateStatus.mutate({ id: m.id, status: 'kept' })}
                        style={{ color: 'var(--mint)' }}
                      >
                        <Check className="size-3.5" /> Kept
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateStatus.mutate({ id: m.id, status: 'broken' })}
                        style={{ color: 'var(--rose)' }}
                      >
                        <X className="size-3.5" /> Broken
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {archivedMissions.length > 0 && (
        <section>
          <SectionHeader title="Archived" />
          <ul className="flex flex-col gap-2.5">
            {archivedMissions.map((m) => {
              const style = STATUS_STYLE[m.status]
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-2 rounded-[1.35rem] bg-card p-4 shadow-[var(--shadow-soft)] ring-1 ring-border/50"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--iris-soft)] text-[var(--iris)]">
                    <Path className="size-4" weight="duotone" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{m.title}</p>
                    <p
                      className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        background: `color-mix(in srgb, ${style.color} 16%, transparent)`,
                        color: style.color,
                      }}
                    >
                      {style.label}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-full"
                    disabled={unarchiveMission.isPending}
                    onClick={() => handleUnarchive(m.id, m.title)}
                  >
                    Restore
                  </Button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <MissionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreate}
        isSubmitting={createMission.isPending}
      />

      <BottomNav />
    </main>
  )
}
