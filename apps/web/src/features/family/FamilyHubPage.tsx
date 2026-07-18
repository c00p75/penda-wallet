import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Baby, Users, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { HeroCard } from '@/components/ui/hero-card'
import { IconTile } from '@/components/ui/icon-tile'
import { SectionHeader } from '@/components/ui/section-header'
import { ActivityRow } from '@/components/ui/activity-row'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { AiInsight } from '@/components/AiInsight'
import { formatMoney } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useSpendingPlan } from '@/features/planning/hooks'
import { useCreateSavingsGoal, useSavingsGoals } from '@/features/goals/hooks'
import { localMonthStart } from '@/lib/dates'
import { useProfile } from '@/features/profile/hooks'
import { termFor } from '@/features/profile/modes'

/** Family-mode hub: household plan snapshot + pocket-money (allowance) goals. */
export function FamilyHubPage() {
  const session = useAuthStore((s) => s.session)
  const navigate = useNavigate()
  const { data: wallet } = useCurrentWallet()
  const { data: profile } = useProfile(session?.user.id)
  const monthStart = localMonthStart()
  const { data: plan } = useSpendingPlan(wallet?.id, monthStart)
  const { data: goals = [] } = useSavingsGoals(wallet?.id)
  const createGoal = useCreateSavingsGoal(wallet?.id)

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const mode = profile?.mode ?? 'individual'
  const allowances = goals.filter((g) => /allowance|pocket|kids?/i.test(g.name))

  async function addAllowance() {
    try {
      await createGoal.mutateAsync({
        input: {
          name: 'Kids allowance',
          icon: '🧒',
          image_path: null,
          target_amount_minor: 50_000,
          target_date: null,
          motivation: 'Pocket money for the household',
        },
        initialAmountMinor: 0,
      })
      toast('Allowance goal created — rename it for each kid.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24">
      <AppHeader />
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
          <h1 className="text-[2rem] font-bold tracking-tight leading-tight">Family hub</h1>
          <p className="text-sm text-muted-foreground">Household plan &amp; allowances</p>
        </div>
      </header>

      <AiInsight askText="Help us stay on track as a household this month">
        Your {termFor(mode, 'plan').toLowerCase()} is the shared intention — invite members from the wallet
        switcher so everyone sees the same numbers.
      </AiInsight>

      <HeroCard tone="iris" className="w-full min-h-[8rem]">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-white/20">
            <Users className="size-6" />
          </span>
          <div>
            <p className="text-sm font-medium text-white/85">Household plan</p>
            {plan ? (
              <p className="mt-1 text-3xl font-bold tabular-nums">
                <HiddenAmount>{formatMoney(plan.intended_amount_minor, wallet.base_currency)}</HiddenAmount>
                <span className="ml-2 text-base font-medium text-white/80">this month</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-white/85">No plan yet — set one on Budgets.</p>
            )}
          </div>
        </div>
      </HeroCard>

      <div className="grid grid-cols-2 gap-3">
        <IconTile icon={Wallet} label="Open budgets" tone="mint" onClick={() => navigate('/budgets')} />
        <IconTile icon={Baby} label="New allowance" tone="apricot" onClick={addAllowance} />
      </div>

      <section>
        <SectionHeader title="Allowances" actionLabel="+ New" onAction={addAllowance} />
        {allowances.length === 0 ? (
          <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Track pocket money as named savings goals — one per kid.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {allowances.map((g) => (
              <ActivityRow
                key={g.id}
                onClick={() => navigate(`/goals/${g.id}`)}
                avatar={<span>{g.icon ?? '🧒'}</span>}
                title={g.name}
                subtitle="Pocket money goal"
                trailing={
                  <HiddenAmount>{formatMoney(g.current_amount_minor, wallet.base_currency)}</HiddenAmount>
                }
                showChevron
              />
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  )
}
