import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { BottomNav } from '@/components/BottomNav'
import { PageHeader } from '@/components/PageHeader'
import { SectionHeader } from '@/components/ui/section-header'
import { ActivityRow } from '@/components/ui/activity-row'
import { Button } from '@/components/ui/button'
import { AiInsight } from '@/components/AiInsight'
import { formatMoney } from '@/lib/money'
import { HiddenAmount } from '@/features/lock/HiddenAmount'
import {
  localDateStr,
  localMonthEnd,
  localMonthPrefix,
  localMonthStart,
} from '@/lib/dates'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/features/chat/chatStore'
import { useCurrentWallet } from '@/features/wallets/hooks'
import { useTransactions } from '@/features/transactions/hooks'
import { useRecurringTransactions } from '@/features/recurring/hooks'
import { useDebts } from '@/features/debts/hooks'
import { useProfile } from '@/features/profile/hooks'
import { useSavingsGoals } from '@/features/goals/hooks'
import { upcomingFixedCosts } from '@/features/planning/fixedCosts'
import { computeSafeToSpend } from '@/features/planning/spendingPlan'
import { useSpendingPlan } from '@/features/planning/hooks'
import { suggestBufferFromIncome } from '@/features/planning/bufferSuggest'
import { remainingFromCashInMinor, walletBalanceMinor } from '@/features/planning/walletBalance'
import { buildObligationRadar, radarCoachingLine } from './obligationRadar'
import { buildSalaryPlan, salaryPlanChatSeed } from './salaryOrchestrator'
import { buildProtectWeekendPlan } from './protectWeekend'
import { detectMerchantSignals } from '@/features/merchants/subscriptionBrain'
import { peerBenchmarksForBand, compareSpendToBenchmark } from '@/features/benchmarks/peerBenchmarks'
import { lifeEventActive, lifeEventCoachingLine } from '@/features/lifeEvents/types'
import { useCreateMission } from '@/features/missions/hooks'

export function MoneyRadarPage() {
  const session = useAuthStore((s) => s.session)
  const navigate = useNavigate()
  const openChat = useChatStore((s) => s.openChat)
  const { data: wallet } = useCurrentWallet()
  const { data: profile } = useProfile(session?.user.id)
  const { data: transactions = [] } = useTransactions(wallet?.id)
  const { data: recurring = [] } = useRecurringTransactions(wallet?.id)
  const { data: debts = [] } = useDebts(wallet?.id)
  const { data: goals = [] } = useSavingsGoals(wallet?.id)
  const monthStart = localMonthStart()
  const { data: plan } = useSpendingPlan(wallet?.id, monthStart)
  const createMission = useCreateMission(wallet?.id, session?.user.id)

  if (!session) return <Navigate to="/login" replace />
  if (!wallet) return null

  const currency = wallet.base_currency
  const now = new Date()
  const today = localDateStr(now)
  const radar = buildObligationRadar({ recurring, debts, days: 14, now })
  const monthPrefix = localMonthPrefix(now)
  const monthSpent = transactions
    .filter((t) => t.type === 'expense' && t.transaction_date.startsWith(monthPrefix))
    .reduce((s, t) => s + (t.converted_amount_minor ?? t.amount_minor), 0)
  const monthIncome = transactions
    .filter((t) => t.type === 'income' && t.transaction_date.startsWith(monthPrefix))
    .reduce((s, t) => s + (t.converted_amount_minor ?? t.amount_minor), 0)
  const fixed = upcomingFixedCosts(recurring, today, localMonthEnd(now))
  const safe = plan
    ? computeSafeToSpend({
        intendedMinor: plan.intended_amount_minor,
        spentMinor: monthSpent,
        upcomingFixedMinor: fixed.totalMinor,
        monthStart,
      })
    : null

  const lastIncome = [...transactions]
    .filter((t) => t.type === 'income')
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))[0]
  const incomeMinor = lastIncome
    ? (lastIncome.converted_amount_minor ?? lastIncome.amount_minor)
    : 0
  const balanceMinor = walletBalanceMinor(transactions)
  const buffer = suggestBufferFromIncome(transactions, {
    now,
    availableBalanceMinor: balanceMinor,
  })
  // Allocate only what remains of the last cash-in (and never more than balance).
  const remainingFromIncome = lastIncome
    ? remainingFromCashInMinor(transactions, lastIncome, { now })
    : 0
  const allocatableMinor = Math.max(0, Math.min(remainingFromIncome, balanceMinor))
  const MIN_SALARY_ALLOCATABLE = 5_000
  const scale = incomeMinor > 0 ? allocatableMinor / incomeMinor : 0
  const pyfIdeal = Math.floor((incomeMinor * (profile?.pay_yourself_first_pct ?? 0)) / 100)
  const taxIdeal =
    profile?.mode === 'business'
      ? Math.floor((incomeMinor * (profile.tax_reserve_pct ?? 0)) / 100)
      : 0
  const salaryPlan =
    allocatableMinor >= MIN_SALARY_ALLOCATABLE
      ? buildSalaryPlan({
          incomeMinor: allocatableMinor,
          fixedCostsMinor: Math.floor(fixed.totalMinor * scale),
          bufferMinor: buffer?.suggestMinor ?? Math.floor(allocatableMinor * 0.1),
          goalsMinor: Math.floor((pyfIdeal || Math.floor(incomeMinor * 0.1)) * scale),
          taxReserveMinor: Math.floor(taxIdeal * scale),
        })
      : null

  const daysLeftInMonth = Math.max(
    1,
    new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1,
  )
  const protect = buildProtectWeekendPlan({
    safeToSpendDailyMinor:
      safe?.perDayMinor ?? Math.max(0, Math.floor(Math.max(0, balanceMinor) / daysLeftInMonth)),
    currency,
    now,
  })

  const merchants = detectMerchantSignals(transactions, { now })
  const benchmarks = peerBenchmarksForBand(profile?.income_range, monthIncome)
  const life = profile?.life_event
  const lifeOn = lifeEventActive(life, today)

  async function startProtectWeekend() {
    try {
      await createMission.mutateAsync({
        title: protect.title,
        description: `${protect.description} Cap ~${formatMoney(protect.dailyCapMinor, currency)}/day.`,
        start_date: protect.startDate,
        end_date: protect.endDate,
      })
      toast('Weekend protect mission started.')
      openChat(protect.chatSeed, { autoSend: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start mission.')
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-5 bg-background px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      <PageHeader title="Money radar" subtitle="Obligations, payday plan, autopilots" />

      {lifeOn && life ? (
        <AiInsight askText={lifeEventCoachingLine(life)}>{lifeEventCoachingLine(life)}</AiInsight>
      ) : null}

      <AiInsight askText={radarCoachingLine(radar, currency)}>
        {radarCoachingLine(radar, currency)}
      </AiInsight>

      <section>
        <SectionHeader
          title="Next 14 days"
          actionLabel="Cashflow"
          onAction={() => navigate('/cashflow')}
        />
        {radar.obligations.length === 0 ? (
          <p className="rounded-[1.5rem] border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No bills or debts due in this window.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {radar.obligations.slice(0, 12).map((o) => (
              <ActivityRow
                key={o.id}
                title={o.label}
                subtitle={`${o.kind} · ${o.date}`}
                trailing={
                  <span
                    className={
                      o.isOutflow
                        ? 'font-semibold tabular-nums text-destructive'
                        : 'font-semibold tabular-nums text-[var(--status-good)]'
                    }
                  >
                    <HiddenAmount>
                      {o.isOutflow ? '−' : '+'}
                      {formatMoney(o.amountMinor, currency)}
                    </HiddenAmount>
                  </span>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title="Autopilots" />
        <Button
          className="rounded-full"
          onClick={startProtectWeekend}
          disabled={createMission.isPending}
        >
          Protect this weekend
        </Button>
        {salaryPlan ? (
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => openChat(salaryPlanChatSeed(salaryPlan, currency), { autoSend: true })}
          >
            Run salary-day plan
          </Button>
        ) : null}
        <Button variant="outline" className="rounded-full" onClick={() => navigate('/budgets')}>
          Open budgets & bills
        </Button>
      </section>

      {salaryPlan ? (
        <section>
          <SectionHeader title="Last income → proposed split" />
          <div className="flex flex-col gap-2.5">
            {salaryPlan.slices.map((s) => (
              <ActivityRow
                key={s.key}
                title={s.label}
                trailing={<HiddenAmount>{formatMoney(s.amountMinor, currency)}</HiddenAmount>}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader title="Subscriptions & merchants" />
        {merchants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subscription signals yet. Keep logging.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {merchants.map((m) => (
              <ActivityRow
                key={m.id}
                title={m.merchant}
                subtitle={m.summary}
                onClick={() => openChat(m.summary, { autoSend: true })}
                showChevron
              />
            ))}
          </div>
        )}
      </section>

      {benchmarks.length > 0 ? (
        <section>
          <SectionHeader title="Soft benchmarks" />
          <p className="mb-2 text-xs text-muted-foreground">
            Illustrative healthy shares based on your income, not other users’ data.
          </p>
          <div className="flex flex-col gap-2.5">
            {benchmarks.map((b) => {
              const spent = transactions
                .filter(
                  (t) =>
                    t.type === 'expense' &&
                    t.transaction_date.startsWith(monthPrefix) &&
                    b.matchKeywords.some((kw) => (t.category?.name ?? '').toLowerCase().includes(kw)),
                )
                .reduce((s, t) => s + (t.converted_amount_minor ?? t.amount_minor), 0)
              const cmp = compareSpendToBenchmark(spent, b.amountMinor)
              return (
                <ActivityRow
                  key={b.category}
                  title={b.category}
                  subtitle={`${b.tip} You’re ${cmp}.`}
                  trailing={<HiddenAmount>{formatMoney(b.amountMinor, currency)}</HiddenAmount>}
                />
              )
            })}
          </div>
        </section>
      ) : null}

      {goals.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {goals.length} goal{goals.length === 1 ? '' : 's'} on this wallet. Salary plan can feed them.
        </p>
      ) : null}

      <BottomNav />
    </main>
  )
}
