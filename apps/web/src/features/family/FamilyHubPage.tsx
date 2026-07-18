import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Baby, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BottomNav } from '@/components/BottomNav'
import { AppHeader } from '@/components/AppHeader'
import { AiInsight } from '@/components/AiInsight'
import { formatMoney } from '@/lib/money'
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
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-4 bg-background p-4 pb-24">
      <AppHeader />
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Family hub</h1>
          <p className="text-sm text-muted-foreground">Household plan &amp; allowances</p>
        </div>
      </header>

      <AiInsight askText="Help us stay on track as a household this month">
        Your {termFor(mode, 'plan').toLowerCase()} is the shared intention — invite members from the wallet
        switcher so everyone sees the same numbers.
      </AiInsight>

      <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4" />
          Household plan
        </div>
        {plan ? (
          <p className="text-2xl font-semibold tabular-nums">
            {formatMoney(plan.intended_amount_minor, wallet.base_currency)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">this month</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No plan yet — set one on Budgets.</p>
        )}
        <Button variant="outline" size="sm" className="self-start" onClick={() => navigate('/budgets')}>
          Open budgets
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Baby className="size-4" />
            Allowances
          </div>
          <button type="button" className="text-sm text-primary" onClick={addAllowance}>
            + New
          </button>
        </div>
        {allowances.length === 0 ? (
          <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Track pocket money as named savings goals — one per kid.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {allowances.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-2xl border bg-card px-4 py-3 text-left"
                  onClick={() => navigate(`/goals/${g.id}`)}
                >
                  <span className="font-medium">
                    {g.icon} {g.name}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatMoney(g.current_amount_minor, wallet.base_currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <BottomNav />
    </main>
  )
}
