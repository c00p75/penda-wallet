import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { notifyUser } from '../_shared/notify.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { mapLimit } from '../_shared/concurrency.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

// Don't nag early in a period, and only speak when spend is meaningfully ahead
// of the calendar. A budget already over is always worth a heads-up.
const AHEAD_THRESHOLD = 0.2 // spent fraction must lead elapsed fraction by this
const MIN_SPENT_FRACTION = 0.6 // …and be at least this far in, so it's real

type Period = 'weekly' | 'monthly'

interface BudgetRow {
  id: string
  category_id: string | null
  /** Cap used for pacing — effective amount when rollover is on. */
  amount_minor: number
  period: Period
}

interface TxRow {
  amount_minor: number
  category_id: string | null
  transaction_date: string
}

interface PaceResult {
  budgetId: string
  categoryId: string | null
  amountMinor: number
  spentMinor: number
  spentFrac: number
  daysLeft: number
  period: Period
  over: boolean
}

// Roadmap bet #7 (proactive coaching): when nothing is burning, still look for
// something worth surfacing unprompted — an underspend to redirect, a pattern
// with no budget yet, or a goal worth celebrating. "One thing a day" means
// this only fires when the burn-rate pace check above found nothing.
type CoachingKind = 'opportunity' | 'observability' | 'celebration'

interface CoachingResult {
  kind: CoachingKind
  title: string
  body: string
  url: string
  meta: Record<string, unknown>
}

interface WideTxRow {
  amount_minor: number
  category_id: string | null
  transaction_date: string
  type: string
}

interface GoalRow {
  id: string
  name: string
  target_amount_minor: number
  current_amount_minor: number
}

interface CategoryRow {
  id: string
  name: string
}

const OPPORTUNITY_MIN_BASELINE_MINOR = 20_000
const OPPORTUNITY_UNDERSPEND_FACTOR = 0.7
const OBSERVABILITY_MIN_90D_TOTAL_MINOR = 15_000
const OBSERVABILITY_MIN_COUNT = 2
const CELEBRATION_MIN_PCT = 0.8

function sumExpense(rows: WideTxRow[], fromExclusive: string, throughInclusive: string): number {
  return rows
    .filter((t) => t.type === 'expense' && t.transaction_date > fromExclusive && t.transaction_date <= throughInclusive)
    .reduce((sum, t) => sum + t.amount_minor, 0)
}

export function pickCoachingInsight(
  transactions: WideTxRow[],
  goals: GoalRow[],
  categories: CategoryRow[],
  budgets: BudgetRow[],
  now: Date,
  currency: string,
): CoachingResult | null {
  const daysAgoStr = (n: number) =>
    toStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n)))
  const today = daysAgoStr(0)

  // Opportunity — spent noticeably less than the recent baseline this week.
  const last7 = sumExpense(transactions, daysAgoStr(7), today)
  const baselineWeekly = sumExpense(transactions, daysAgoStr(35), daysAgoStr(7)) / 4
  if (baselineWeekly >= OPPORTUNITY_MIN_BASELINE_MINOR && last7 <= baselineWeekly * OPPORTUNITY_UNDERSPEND_FACTOR) {
    const diff = Math.round(baselineWeekly - last7)
    const goal = goals.find((g) => g.current_amount_minor < g.target_amount_minor)
    return {
      kind: 'opportunity',
      title: 'Nice spending week',
      body: goal
        ? `You spent ${fmt(diff, currency)} less than usual this week — want to move it toward "${goal.name}"?`
        : `You spent ${fmt(diff, currency)} less than usual this week. A great moment to stash it.`,
      url: '/goals',
      meta: { diff_minor: diff, goal_id: goal?.id ?? null },
    }
  }

  // Observability — a real spending pattern (90 days) with no budget behind it.
  const budgetedCategoryIds = new Set(budgets.map((b) => b.category_id).filter((id): id is string => !!id))
  const byCategory = new Map<string, { total: number; count: number }>()
  for (const t of transactions) {
    if (t.type !== 'expense' || !t.category_id || budgetedCategoryIds.has(t.category_id)) continue
    const entry = byCategory.get(t.category_id) ?? { total: 0, count: 0 }
    entry.total += t.amount_minor
    entry.count += 1
    byCategory.set(t.category_id, entry)
  }
  const topUnbudgeted = [...byCategory.entries()]
    .filter(([, v]) => v.count >= OBSERVABILITY_MIN_COUNT && v.total >= OBSERVABILITY_MIN_90D_TOTAL_MINOR)
    .sort((a, b) => b[1].total - a[1].total)[0]
  if (topUnbudgeted) {
    const [categoryId, v] = topUnbudgeted
    const categoryName = categories.find((c) => c.id === categoryId)?.name ?? 'that category'
    const monthlyAvgMinor = Math.round(v.total / 3) // the transaction window is ~90 days
    return {
      kind: 'observability',
      title: 'A pattern Penda noticed',
      body: `You're spending about ${fmt(monthlyAvgMinor, currency)}/mo on ${categoryName} with no budget. Want one?`,
      url: '/budgets',
      meta: { category_id: categoryId, monthly_average_minor: monthlyAvgMinor },
    }
  }

  // Celebration — a goal that's funded or nearly there.
  const closest = goals
    .map((g) => ({ g, pct: g.target_amount_minor > 0 ? g.current_amount_minor / g.target_amount_minor : 0 }))
    .filter((x) => x.pct >= CELEBRATION_MIN_PCT)
    .sort((a, b) => b.pct - a.pct)[0]
  if (closest) {
    const { g, pct } = closest
    const remaining = Math.max(0, g.target_amount_minor - g.current_amount_minor)
    return {
      kind: 'celebration',
      title: '🎉 Goal milestone',
      body:
        pct >= 1
          ? `You fully funded "${g.name}". Time to set the next dream?`
          : `You're ${Math.round(pct * 100)}% of the way to "${g.name}" — only ${fmt(remaining, currency)} to go!`,
      url: '/goals',
      meta: { goal_id: g.id },
    }
  }

  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Cron-only, cross-wallet — same shared-secret authorization as the weekly
  // digest (not an end-user session), so it deliberately skips the RLS pattern.
  if (req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('id, base_currency')
    if (walletsError) throw walletsError

    // Bounded fan-out with per-wallet failure isolation — the old sequential
    // loop's runtime grew linearly with wallets and one throw sank the run.
    const results = await mapLimit(wallets ?? [], 6, async (wallet) => {
      try {
        const result = await nudgeForWallet(supabase, wallet.id, wallet.base_currency)
        return { walletId: wallet.id, ...result }
      } catch (error) {
        console.error(
          `Burn-rate nudge failed for wallet ${wallet.id}:`,
          error instanceof Error ? error.message : String(error),
        )
        return { walletId: wallet.id, error: 'failed' }
      }
    })
    return jsonResponse({ processed: results.length, results })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function nudgeForWallet(supabase: SupabaseClient, walletId: string, currency: string) {
  // Premium members first (parity with the weekly digest — proactive coaching
  // is a Premium surface): an all-free wallet skips the pace computation and
  // coaching scan entirely. One entitlements query instead of an is_premium
  // RPC per member (this runs on the service role client).
  const { data: members, error: membersError } = await supabase
    .from('wallet_members')
    .select('user_id')
    .eq('wallet_id', walletId)
  if (membersError) throw membersError

  const memberIds = (members ?? []).map((m) => m.user_id)
  if (memberIds.length === 0) return { skipped: 'no members' }

  const { data: premiumRows, error: premiumError } = await supabase
    .from('entitlements')
    .select('user_id')
    .in('user_id', memberIds)
    .eq('plan', 'premium')
  if (premiumError) throw premiumError

  const premiumIds = (premiumRows ?? []).map((r) => r.user_id)
  if (premiumIds.length === 0) return { skipped: 'no premium members' }

  // Prefer effective caps (incl. rollover carry) — same source as the Budgets UI.
  const { data: progressRows, error: progressError } = await supabase.rpc('get_budget_progress', {
    p_wallet_id: walletId,
  })
  if (progressError) throw progressError

  const budgets: BudgetRow[] = (progressRows ?? []).map(
    (row: {
      budget_id: string
      category_id: string | null
      effective_amount_minor: number
      period: Period
    }) => ({
      id: row.budget_id,
      category_id: row.category_id,
      amount_minor: Number(row.effective_amount_minor),
      period: row.period,
    }),
  )

  const now = new Date()
  let worst: PaceResult | null = null
  if (budgets.length > 0) {
    // The earliest period start we might need is the start of the month; fetch
    // confirmed expenses from there once and slice per budget in memory.
    const monthStart = toStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('amount_minor, category_id, transaction_date')
      .eq('wallet_id', walletId)
      .eq('user_confirmed', true)
      .is('deleted_at', null)
      .eq('type', 'expense')
      .gte('transaction_date', monthStart)
    if (txError) throw txError
    worst = pickWorstBudget(budgets, (transactions ?? []) as TxRow[], now)
  }

  let title = 'A heads-up on your budget'
  let url = '/budgets'
  let body: string
  let content: Record<string, unknown>

  if (worst) {
    // Resolve the category name for the copy (null category = the overall budget).
    let categoryName = 'Overall'
    if (worst.categoryId) {
      const { data: category } = await supabase
        .from('categories')
        .select('name')
        .eq('id', worst.categoryId)
        .maybeSingle()
      if (category?.name) categoryName = category.name
    }
    body = nudgeCopy(worst, currency, categoryName)
    content = { text: body, kind: 'burn_rate', budget_id: worst.budgetId }
  } else {
    // Nothing burning — still see if there's something worth saying unprompted
    // (roadmap bet #7). Needs a wider window than the burn-rate check above.
    const wideStart = toStr(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 90)))
    const [{ data: wideTx }, { data: goals }, { data: categories }] = await Promise.all([
      supabase
        .from('transactions')
        .select('amount_minor, category_id, transaction_date, type')
        .eq('wallet_id', walletId)
        .eq('user_confirmed', true)
        .is('deleted_at', null)
        .gte('transaction_date', wideStart),
      supabase
        .from('savings_goals')
        .select('id, name, target_amount_minor, current_amount_minor')
        .eq('wallet_id', walletId),
      supabase.from('categories').select('id, name').or(`wallet_id.eq.${walletId},wallet_id.is.null`),
    ])

    const coaching = pickCoachingInsight(
      (wideTx ?? []) as WideTxRow[],
      (goals ?? []) as GoalRow[],
      (categories ?? []) as CategoryRow[],
      budgets,
      now,
      currency,
    )
    if (!coaching) return { skipped: 'nothing to say' }

    title = coaching.title
    url = coaching.url
    body = coaching.body
    content = { text: body, kind: coaching.kind, ...coaching.meta }
  }

  const day = toStr(now)
  const { data: existingRows } = await supabase
    .from('ai_insights')
    .select('user_id')
    .eq('wallet_id', walletId)
    .in('user_id', premiumIds)
    .eq('type', 'recommendation')
    .eq('period_end', day)
  const alreadyNudged = new Set((existingRows ?? []).map((r) => r.user_id))

  const kind = content.kind === 'burn_rate' ? 'alert' : 'tip'
  const dedupePrefix = content.kind === 'burn_rate' ? 'burn' : `coach:${String(content.kind)}`

  let notified = 0
  for (const userId of premiumIds) {
    // At most one nudge per member per day — burn-rate or coaching, never both.
    if (alreadyNudged.has(userId)) continue

    await supabase.from('ai_insights').insert({
      wallet_id: walletId,
      user_id: userId,
      type: 'recommendation',
      content,
      period_start: day,
      period_end: day,
    })

    // Inbox + optional Web Push (opt-in / category prefs gated inside notifyUser).
    await notifyUser(supabase, {
      userId,
      walletId,
      kind,
      title,
      body,
      href: url,
      dedupeKey: `${dedupePrefix}:${walletId}:${day}`,
      payload: content,
    })
    notified++
  }

  return { body, notified }
}

/**
 * The single most urgent budget: the one whose spend most outruns how far into
 * its period we are (or is already over). Returns null when nothing crosses the
 * "worth interrupting someone's day" bar.
 */
export function pickWorstBudget(budgets: BudgetRow[], transactions: TxRow[], now: Date): PaceResult | null {
  let worst: PaceResult | null = null
  let worstLead = 0

  for (const b of budgets) {
    if (b.amount_minor <= 0) continue
    const bounds = periodBounds(b.period, now)
    const spentMinor = transactions
      .filter((t) => t.transaction_date >= bounds.start && t.transaction_date <= bounds.end)
      .filter((t) => b.category_id === null || t.category_id === b.category_id)
      .reduce((sum, t) => sum + t.amount_minor, 0)

    const spentFrac = spentMinor / b.amount_minor
    const elapsedFrac = bounds.elapsedDays / bounds.totalDays
    const over = spentFrac >= 1
    const burningFast = spentFrac - elapsedFrac >= AHEAD_THRESHOLD && spentFrac >= MIN_SPENT_FRACTION
    if (!over && !burningFast) continue

    // Rank over-budget above merely-fast, then by how far ahead of pace.
    const lead = (over ? 1 : 0) + (spentFrac - elapsedFrac)
    if (lead > worstLead) {
      worstLead = lead
      worst = {
        budgetId: b.id,
        categoryId: b.category_id,
        amountMinor: b.amount_minor,
        spentMinor,
        spentFrac,
        daysLeft: bounds.totalDays - bounds.elapsedDays,
        period: b.period,
        over,
      }
    }
  }

  return worst
}

function nudgeCopy(r: PaceResult, currency: string, categoryName: string): string {
  const periodWord = r.period === 'weekly' ? 'week' : 'month'
  const pct = Math.round(r.spentFrac * 100)
  if (r.over) {
    return `${categoryName} is over budget — ${fmt(r.spentMinor, currency)} of ${fmt(r.amountMinor, currency)} this ${periodWord}. Want to rebalance?`
  }
  const daysWord = r.daysLeft === 1 ? 'day' : 'days'
  return `${categoryName} is running hot — ${pct}% spent with ${r.daysLeft} ${daysWord} left this ${periodWord}.`
}

interface PeriodBounds {
  start: string
  end: string
  totalDays: number
  elapsedDays: number
}

/**
 * Current period window for a budget, matching Postgres `date_trunc` semantics
 * used by get_budget_progress: ISO weeks start Monday; months are calendar
 * months. elapsedDays counts today (1-based) and is clamped to the period.
 */
export function periodBounds(period: Period, now: Date): PeriodBounds {
  let start: Date
  let end: Date
  if (period === 'weekly') {
    const daysSinceMonday = (now.getUTCDay() + 6) % 7
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday))
    end = new Date(start)
    end.setUTCDate(start.getUTCDate() + 6)
  } else {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
  }
  const dayMs = 86_400_000
  const totalDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1
  const elapsedDays = Math.min(
    totalDays,
    Math.max(1, Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start.getTime()) / dayMs) + 1),
  )
  return { start: toStr(start), end: toStr(end), totalDays, elapsedDays }
}

function toStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function fmt(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toFixed(2)}`
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
