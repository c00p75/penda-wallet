import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Baby, Users, Wallet } from '@/components/icons/product'
import { toast } from 'sonner'
import { HeroCard } from '@/components/ui/hero-card'
import { IconTile } from '@/components/ui/icon-tile'
import { SectionHeader } from '@/components/ui/section-header'
import { ActivityRow } from '@/components/ui/activity-row'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { AiInsight } from '@/components/AiInsight'
import { formatMoney, fromMinorUnits, toMinorUnits } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import { useAuthStore } from '@/store/authStore'
import { useCurrentWallet, useWalletMembers } from '@/features/wallets/hooks'
import { useSpendingPlan } from '@/features/planning/hooks'
import { fetchPlanShares, savePlanShares } from '@/features/planning/sharesApi'
import { useCreateSavingsGoal, useSavingsGoals, useUpdateSavingsGoal } from '@/features/goals/hooks'
import { localMonthStart } from '@/lib/dates'
import { useProfile } from '@/features/profile/hooks'
import { termFor } from '@/features/profile/modes'
import { detectFamilyCompanionTips } from '@/features/companion/familyCompanion'
import { useChatStore } from '@/features/chat/chatStore'
import { DEFAULT_COMPANION_PREFS } from '@/features/companion/companionPrefs'

/** Family-mode hub: household plan snapshot + pocket-money (allowance) goals. */
export function FamilyHubPage() {
  const session = useAuthStore((s) => s.session)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: wallet } = useCurrentWallet()
  const { data: profile } = useProfile(session?.user.id)
  const { data: members = [] } = useWalletMembers(wallet?.id)
  const monthStart = localMonthStart()
  const { data: plan } = useSpendingPlan(wallet?.id, monthStart)
  const { data: goals = [] } = useSavingsGoals(wallet?.id)
  const createGoal = useCreateSavingsGoal(wallet?.id)
  const updateGoal = useUpdateSavingsGoal(wallet?.id)
  const openChat = useChatStore((s) => s.openChat)

  const { data: shares = [] } = useQuery({
    queryKey: ['plan-shares', plan?.id],
    queryFn: () => fetchPlanShares(plan!.id),
    enabled: !!plan?.id,
  })

  const [allocInputs, setAllocInputs] = useState<Record<string, string>>({})
  const [savingShares, setSavingShares] = useState(false)

  useEffect(() => {
    if (!plan || members.length === 0) return
    const next: Record<string, string> = {}
    for (const m of members) {
      const share = shares.find((s) => s.member_id === m.user_id)
      next[m.user_id] = share
        ? fromMinorUnits(share.allocated_minor).toFixed(2)
        : ''
    }
    setAllocInputs(next)
  }, [plan, members, shares])

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const mode = profile?.mode ?? 'individual'
  const allowances = goals.filter((g) => /allowance|pocket|kids?/i.test(g.name))
  const currency = wallet.base_currency
  const familyTips = detectFamilyCompanionTips({
    mode,
    currency,
    allowances,
    enabled: (profile?.companion_prefs ?? DEFAULT_COMPANION_PREFS).family_nudges,
  })

  const labelFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.display_name?.trim() ||
    members.find((m) => m.user_id === userId)?.email ||
    'Member'

  async function addAllowance(memberId?: string) {
    try {
      await createGoal.mutateAsync({
        input: {
          name: memberId ? `${labelFor(memberId)} allowance` : 'Kids allowance',
          icon: '🧒',
          image_path: null,
          target_amount_minor: 50_000,
          target_date: null,
          motivation: 'Pocket money for the household',
          assigned_member_id: memberId ?? null,
        },
        initialAmountMinor: 0,
      })
      toast(memberId ? `Allowance for ${labelFor(memberId)} created.` : 'Allowance goal created.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function assignAllowance(goalId: string, memberId: string) {
    const goal = goals.find((g) => g.id === goalId)
    if (!goal) return
    try {
      await updateGoal.mutateAsync({
        id: goalId,
        input: {
          name: goal.name,
          icon: goal.icon,
          image_path: goal.image_path,
          target_amount_minor: goal.target_amount_minor,
          target_date: goal.target_date,
          motivation: goal.motivation,
          assigned_member_id: memberId || null,
        },
      })
      toast('Allowance assigned.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not assign.')
    }
  }

  async function saveAllocations() {
    if (!plan) return
    const rows = members.map((m) => ({
      member_id: m.user_id,
      allocated_minor: toMinorUnits(Number(allocInputs[m.user_id]) || 0),
    }))
    const sum = rows.reduce((a, r) => a + r.allocated_minor, 0)
    if (sum > plan.intended_amount_minor) {
      toast.error(`Allocations exceed the plan (${formatMoney(plan.intended_amount_minor, currency)}).`)
      return
    }
    setSavingShares(true)
    try {
      await savePlanShares(
        plan.id,
        rows.filter((r) => r.allocated_minor > 0),
      )
      await queryClient.invalidateQueries({ queryKey: ['plan-shares', plan.id] })
      toast('Household allocations saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save.')
    } finally {
      setSavingShares(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader title="Family hub" subtitle="Household plan & allowances" />

      <AiInsight
        featured
        askText={
          familyTips[0]?.chatSeed ?? 'Help us stay on track as a household this month'
        }
      >
        {familyTips[0]?.text ??
          `Your ${termFor(mode, 'plan').toLowerCase()} is the shared intention, invite members so everyone sees the same numbers and allocations.`}
      </AiInsight>
      {familyTips[0] && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => openChat(familyTips[0]!.chatSeed, { autoSend: true })}
        >
          Talk with Penda
        </Button>
      )}

      <HeroCard tone="iris" className="w-full min-h-[8rem]">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-white/20">
            <Users className="size-6" weight="duotone" />
          </span>
          <div>
            <p className="text-sm font-medium text-white/85">Household plan</p>
            {plan ? (
              <p className="mt-1 text-3xl font-bold tabular-nums">
                <HiddenAmount>
                  {formatMoney(plan.intended_amount_minor, currency)}
                </HiddenAmount>
                <span className="ml-2 text-base font-medium text-white/80">this month</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-white/85">No plan yet. Set one on Budgets.</p>
            )}
          </div>
        </div>
      </HeroCard>

      <div className="grid grid-cols-2 gap-3">
        <IconTile icon={Wallet} label="Open budgets" tone="mint" onClick={() => navigate('/budgets')} />
        <IconTile icon={Baby} label="New allowance" tone="apricot" onClick={() => addAllowance()} />
        <IconTile icon={Users} label="Settle up" tone="iris" onClick={() => navigate('/settle-up')} />
        <IconTile
          icon={Users}
          label="Invite member"
          tone="sun"
          onClick={() => navigate('/profile')}
        />
      </div>

      <section>
        <SectionHeader title="Household members" />
        {members.length === 0 ? (
          <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Invite family from Profile → wallet settings.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {members.map((m) => (
              <ActivityRow
                key={m.user_id}
                title={m.display_name?.trim() || m.email}
                subtitle={m.role}
                trailing={
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full text-xs"
                    onClick={() => addAllowance(m.user_id)}
                  >
                    + Allowance
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </section>

      {plan && members.length > 0 ? (
        <section>
          <SectionHeader title="Plan allocations" />
          <div className="flex flex-col gap-3 rounded-[1.25rem] bg-secondary/30 px-3.5 py-3 ring-1 ring-border/50">
            {members.map((m) => (
              <div key={m.user_id} className="flex flex-col gap-1">
                <Label htmlFor={`alloc-${m.user_id}`}>{labelFor(m.user_id)}</Label>
                <Input
                  id={`alloc-${m.user_id}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={allocInputs[m.user_id] ?? ''}
                  onChange={(e) =>
                    setAllocInputs((prev) => ({ ...prev, [m.user_id]: e.target.value }))
                  }
                />
              </div>
            ))}
            <Button disabled={savingShares} onClick={saveAllocations} className="rounded-full">
              {savingShares ? 'Saving…' : 'Save allocations'}
            </Button>
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader title="Allowances" actionLabel="+ New" onAction={() => addAllowance()} />
        {allowances.length === 0 ? (
          <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Track pocket money as named savings goals, one per kid.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {allowances.map((g) => (
              <div key={g.id} className="flex flex-col gap-2">
                <ActivityRow
                  onClick={() => navigate(`/goals/${g.id}`)}
                  avatar={<span>{g.icon ?? '🧒'}</span>}
                  title={g.name}
                  subtitle={
                    g.assigned_member_id
                      ? `For ${labelFor(g.assigned_member_id)}`
                      : 'Unassigned pocket money'
                  }
                  trailing={
                    <HiddenAmount>
                      {formatMoney(g.current_amount_minor, currency)}
                    </HiddenAmount>
                  }
                  showChevron
                />
                {members.length > 0 ? (
                  <select
                    className="ml-12 h-9 rounded-md border border-input bg-background px-2 text-xs"
                    value={g.assigned_member_id ?? ''}
                    onChange={(e) => assignAllowance(g.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="">Assign to member…</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name?.trim() || m.email}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <BottomNav />
    </main>
  )
}
