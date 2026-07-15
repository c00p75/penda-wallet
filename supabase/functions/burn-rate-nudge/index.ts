import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sendPush } from '../_shared/push.ts'
import { corsHeaders } from '../_shared/cors.ts'

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

    const results = []
    for (const wallet of wallets ?? []) {
      const result = await nudgeForWallet(supabase, wallet.id, wallet.base_currency)
      results.push({ walletId: wallet.id, ...result })
    }
    return jsonResponse({ processed: results.length, results })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function nudgeForWallet(supabase: SupabaseClient, walletId: string, currency: string) {
  const { data: budgets, error: budgetsError } = await supabase
    .from('budgets')
    .select('id, category_id, amount_minor, period')
    .eq('wallet_id', walletId)
  if (budgetsError) throw budgetsError
  if (!budgets || budgets.length === 0) return { skipped: 'no budgets' }

  const now = new Date()
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

  const worst = pickWorstBudget(budgets as BudgetRow[], (transactions ?? []) as TxRow[], now)
  if (!worst) return { skipped: 'nothing burning' }

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

  const body = nudgeCopy(worst, currency, categoryName)

  const { data: members, error: membersError } = await supabase
    .from('wallet_members')
    .select('user_id')
    .eq('wallet_id', walletId)
  if (membersError) throw membersError

  const day = toStr(now)
  let notified = 0
  for (const member of members ?? []) {
    // Parity with the weekly digest: proactive coaching is a Premium surface.
    const { data: isPremium } = await supabase.rpc('is_premium', { p_user_id: member.user_id })
    if (!isPremium) continue

    // At most one pace nudge per member per day, so a hot budget doesn't spam.
    const { data: existing } = await supabase
      .from('ai_insights')
      .select('id')
      .eq('wallet_id', walletId)
      .eq('user_id', member.user_id)
      .eq('type', 'recommendation')
      .eq('period_end', day)
      .limit(1)
    if (existing && existing.length > 0) continue

    await supabase.from('ai_insights').insert({
      wallet_id: walletId,
      user_id: member.user_id,
      type: 'recommendation',
      content: { text: body, kind: 'burn_rate', budget_id: worst.budgetId },
      period_start: day,
      period_end: day,
    })

    await notifyMember(supabase, member.user_id, body)
    notified++
  }

  return { budgetId: worst.budgetId, body, notified }
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

async function notifyMember(supabase: SupabaseClient, userId: string, body: string) {
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, keys')
    .eq('user_id', userId)

  for (const sub of subscriptions ?? []) {
    const result = await sendPush(
      { endpoint: sub.endpoint, keys: sub.keys },
      { title: 'A heads-up on your budget', body, url: '/budgets' },
    )
    if (!result.ok && (result.statusCode === 404 || result.statusCode === 410)) {
      await supabase.from('push_subscriptions').delete().eq('id', sub.id)
    }
  }
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
