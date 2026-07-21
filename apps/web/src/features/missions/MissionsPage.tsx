import { Navigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { Path, Sparkle } from '@/components/icons/product'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { HeroCard } from '@/components/ui/hero-card'
import { SectionHeader } from '@/components/ui/section-header'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { AiInsight } from '@/components/AiInsight'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { cn } from '@/lib/utils'
import { useCreateMission, useMissions, useUpdateMissionStatus } from './hooks'
import { suggestMissions } from './suggestMissions'
import type { MissionStatus } from './types'

const STATUS_CYCLE: MissionStatus[] = ['active', 'kept', 'broken', 'dismissed']

const STATUS_STYLE: Record<MissionStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'var(--iris)' },
  kept: { label: 'Kept', color: 'var(--mint)' },
  broken: { label: 'Broken', color: 'var(--rose)' },
  dismissed: { label: 'Dismissed', color: 'var(--muted-foreground)' },
}

export function MissionsPage() {
  const session = useAuthStore((s) => s.session)
  const userId = session?.user.id
  const { data: wallet } = useCurrentWallet()
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: missions = [] } = useMissions(wallet?.id)
  const createMission = useCreateMission(wallet?.id, userId)
  const updateStatus = useUpdateMissionStatus(wallet?.id)

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  async function handleSuggest() {
    const ideas = suggestMissions(transactions)
    const idea = ideas[0]
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

      <Button onClick={handleSuggest} disabled={createMission.isPending} className="gap-1.5 rounded-full">
        <Sparkle className="size-4" weight="fill" />
        Suggest a mission
      </Button>

      {missions.length === 0 ? (
        <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No missions yet. Tap suggest and I'll pick one from your spending.
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{m.title}</p>
                      {m.description && <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {m.start_date} → {m.end_date}
                      </p>
                    </div>
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
                  </div>
                  {m.status === 'active' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1 rounded-full"
                        onClick={() => updateStatus.mutate({ id: m.id, status: 'kept' })}
                      >
                        <Check className="size-3.5" /> Kept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1 rounded-full"
                        onClick={() => updateStatus.mutate({ id: m.id, status: 'broken' })}
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

      <BottomNav />
    </main>
  )
}
