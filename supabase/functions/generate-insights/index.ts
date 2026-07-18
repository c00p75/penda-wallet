import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { GoogleGenAI } from 'npm:@google/genai@2.11.0'
import { notifyUser } from '../_shared/notify.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { mapLimit } from '../_shared/concurrency.ts'
import { GENDER_LABELS, GOAL_LABELS, PERSONALITY_NAMES, PERSONALITY_PROMPTS } from '../_shared/personas.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

// Persona voice + profile-context fragments live in _shared/personas.ts —
// previously duplicated here and already drifting from chat's versions.

interface CategoryTotal {
  category: string
  amount_minor: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // This function is triggered by pg_cron (or manually for testing), never by
  // an end user — it operates across every wallet, not one user's session, so
  // it intentionally skips the RLS-scoped pattern used by user-facing
  // functions. Authorization is a dedicated shared secret (not the service
  // role key, whose exact runtime format isn't guaranteed) sent as a custom
  // header alongside the Authorization bearer the functions gateway itself
  // requires.
  if (req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { data: wallets, error: walletsError } = await supabase.from('wallets').select('id, base_currency')
    if (walletsError) throw walletsError

    const periodEnd = today()
    const periodStart = daysAgo(7)
    const now = new Date()
    const runAnnual = now.getUTCMonth() === 0 && now.getUTCDate() <= 7

    // Bounded fan-out instead of a strict one-at-a-time walk over every
    // wallet (audit finding: sequential runtime grows linearly with wallets
    // and heads for the function execution limit). Per-wallet failures are
    // isolated — one bad wallet no longer sinks the whole weekly run.
    const results = await mapLimit(wallets ?? [], 5, async (wallet) => {
      try {
        const weekly = await generateForWallet(
          supabase,
          wallet.id,
          wallet.base_currency,
          periodStart,
          periodEnd,
        )
        let annual: Record<string, unknown> | undefined
        if (runAnnual) {
          const year = now.getUTCFullYear() - 1
          annual = await generateAnnualRecap(supabase, wallet.id, wallet.base_currency, year)
        }
        return { walletId: wallet.id, ...weekly, annual }
      } catch (error) {
        console.error(
          `Weekly digest failed for wallet ${wallet.id}:`,
          error instanceof Error ? error.message : String(error),
        )
        return { walletId: wallet.id, error: 'failed' }
      }
    })

    return jsonResponse({ processed: results.length, results, annual: runAnnual })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function generateForWallet(
  supabase: SupabaseClient,
  walletId: string,
  currency: string,
  periodStart: string,
  periodEnd: string,
) {
  // Premium members FIRST (audit finding): the digest is a Premium feature,
  // and the old order paid for an LLM generation before checking whether
  // anyone in the wallet could see it — every all-free wallet burned a model
  // call per week for content that was then thrown away.
  const { data: members, error: membersError } = await supabase
    .from('wallet_members')
    .select('user_id')
    .eq('wallet_id', walletId)
  if (membersError) throw membersError

  const memberIds = (members ?? []).map((m) => m.user_id)
  if (memberIds.length === 0) return { skipped: 'no members' }

  // One query instead of an is_premium RPC per member — this function runs on
  // the service role client, so it can read entitlements directly (the same
  // table is_premium consults).
  const { data: premiumRows, error: premiumError } = await supabase
    .from('entitlements')
    .select('user_id')
    .in('user_id', memberIds)
    .eq('plan', 'premium')
  if (premiumError) throw premiumError

  const premiumIds = (premiumRows ?? []).map((r) => r.user_id)
  if (premiumIds.length === 0) return { skipped: 'no premium members' }

  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('amount_minor, type, category:categories(name)')
    .eq('wallet_id', walletId)
    .eq('user_confirmed', true)
    .is('deleted_at', null)
    .gte('transaction_date', periodStart)
    .lte('transaction_date', periodEnd)

  if (txError) throw txError
  if (!transactions || transactions.length === 0) {
    return { skipped: 'no transactions in period' }
  }

  const totalSpentMinor = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount_minor, 0)
  const totalIncomeMinor = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount_minor, 0)

  const categoryTotals = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    const name = (t.category as unknown as { name: string } | null)?.name ?? 'Uncategorized'
    categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + t.amount_minor)
  }
  const topCategories: CategoryTotal[] = Array.from(categoryTotals.entries())
    .map(([category, amount_minor]) => ({ category, amount_minor }))
    .sort((a, b) => b.amount_minor - a.amount_minor)
    .slice(0, 5)

  const stats = { totalSpentMinor, totalIncomeMinor, topCategories, currency }

  // One digest per DISTINCT persona context, not one per wallet written in
  // members[0]'s voice (audit finding: in a shared wallet, member B used to
  // get a digest written in member A's chosen persona). Identical profiles
  // share a single generation, so the common one-persona wallet still costs
  // exactly one model call.
  const profiles = await Promise.all(premiumIds.map((id) => fetchProfileContext(supabase, id)))
  const profileKey = (p: InsightProfileContext) => `${p.personality}|${p.primaryGoal}|${p.gender}`
  const digestByKey = new Map<string, string>()
  for (const profile of profiles) {
    const key = profileKey(profile)
    if (!digestByKey.has(key)) {
      digestByKey.set(key, await generateDigestText(stats, profile))
    }
  }

  let notified = 0
  for (let i = 0; i < premiumIds.length; i++) {
    const digestText = digestByKey.get(profileKey(profiles[i]))!
    await supabase.from('ai_insights').insert({
      wallet_id: walletId,
      user_id: premiumIds[i],
      type: 'weekly_digest',
      content: {
        text: digestText,
        total_spent_minor: totalSpentMinor,
        total_income_minor: totalIncomeMinor,
        top_categories: topCategories,
      },
      period_start: periodStart,
      period_end: periodEnd,
    })

    await notifyUser(supabase, {
      userId: premiumIds[i],
      walletId,
      kind: 'insight',
      title: 'Your weekly recap',
      body: digestText,
      href: '/analytics',
      dedupeKey: `weekly:${walletId}:${periodEnd}`,
      payload: { period_start: periodStart, period_end: periodEnd },
    })
    notified++
  }

  return { totalSpentMinor, totalIncomeMinor, topCategories, digests: digestByKey.size, notified }
}

async function generateAnnualRecap(
  supabase: SupabaseClient,
  walletId: string,
  currency: string,
  year: number,
) {
  const periodStart = `${year}-01-01`
  const periodEnd = `${year}-12-31`

  const { data: members } = await supabase
    .from('wallet_members')
    .select('user_id')
    .eq('wallet_id', walletId)
  const memberIds = (members ?? []).map((m) => m.user_id)
  if (memberIds.length === 0) return { skipped: 'no members' }

  const { data: premiumRows } = await supabase
    .from('entitlements')
    .select('user_id')
    .in('user_id', memberIds)
    .eq('plan', 'premium')
  const premiumIds = (premiumRows ?? []).map((r) => r.user_id)
  if (premiumIds.length === 0) return { skipped: 'no premium members' }

  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount_minor, converted_amount_minor, type')
    .eq('wallet_id', walletId)
    .eq('user_confirmed', true)
    .is('deleted_at', null)
    .gte('transaction_date', periodStart)
    .lte('transaction_date', periodEnd)

  if (!transactions?.length) return { skipped: 'no transactions' }

  let spent = 0
  let income = 0
  for (const t of transactions) {
    const amt = Number(t.converted_amount_minor ?? t.amount_minor ?? 0)
    if (t.type === 'expense') spent += amt
    else if (t.type === 'income') income += amt
  }

  const body =
    `Your ${year} in money: earned ${fmtMoney(income, currency)}, spent ${fmtMoney(spent, currency)}. ` +
    `Net ${fmtMoney(income - spent, currency)}. Here's to a clearer ${year + 1}.`

  let notified = 0
  for (const userId of premiumIds) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('notification_prefs')
      .eq('id', userId)
      .maybeSingle()
    const prefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>
    if (prefs.annual_recap === false) continue

    await supabase.from('ai_insights').insert({
      wallet_id: walletId,
      user_id: userId,
      type: 'weekly_digest',
      content: {
        text: body,
        kind: 'annual_recap',
        year,
        total_spent_minor: spent,
        total_income_minor: income,
      },
      period_start: periodStart,
      period_end: periodEnd,
    })

    await notifyUser(supabase, {
      userId,
      walletId,
      kind: 'insight',
      title: `${year} year in review`,
      body,
      href: '/analytics',
      dedupeKey: `annual:${walletId}:${year}`,
      payload: { year },
    })
    notified++
  }

  return { year, spent, income, notified }
}

function fmtMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amountMinor / 100)
  } catch {
    return `${(amountMinor / 100).toFixed(0)} ${currency}`
  }
}

interface InsightProfileContext {
  personality: string
  primaryGoal: string | null
  gender: string
}

async function fetchProfileContext(supabase: SupabaseClient, userId: string): Promise<InsightProfileContext> {
  const { data } = await supabase
    .from('profiles')
    .select('ai_personality, primary_goal, gender')
    .eq('id', userId)
    .maybeSingle()
  return {
    personality: data?.ai_personality ?? 'balanced_coach',
    primaryGoal: data?.primary_goal ?? null,
    gender: data?.gender ?? 'prefer_not_to_say',
  }
}

async function generateDigestText(
  stats: { totalSpentMinor: number; totalIncomeMinor: number; topCategories: CategoryTotal[]; currency: string },
  profile: InsightProfileContext,
): Promise<string> {
  const prompt = buildPrompt(stats, profile)
  try {
    return await generateWithGemini(prompt)
  } catch (error) {
    console.error('Gemini insight generation failed, falling back to Groq:', error)
    return await generateWithGroq(prompt)
  }
}

function buildPrompt(
  stats: { totalSpentMinor: number; totalIncomeMinor: number; topCategories: CategoryTotal[]; currency: string },
  profile: InsightProfileContext,
): string {
  const fmt = (minor: number) => (minor / 100).toFixed(2)
  const categoryLines = stats.topCategories
    .map((c) => `- ${c.category}: ${fmt(c.amount_minor)} ${stats.currency}`)
    .join('\n')

  const personalityFragment = PERSONALITY_PROMPTS[profile.personality] ?? PERSONALITY_PROMPTS.balanced_coach
  const personaName = PERSONALITY_NAMES[profile.personality] ?? PERSONALITY_NAMES.balanced_coach

  // Hard requirement, not a suggestion: gender may only ever shape tone here,
  // never the numbers or the advice — see chat-message/index.ts for the
  // matching (and more heavily used) instance of this same guardrail.
  const contextLines: string[] = []
  if (profile.primaryGoal && GOAL_LABELS[profile.primaryGoal]) {
    contextLines.push(
      `Their stated primary financial goal right now is to ${GOAL_LABELS[profile.primaryGoal]}. Connect this digest back to it where it fits naturally.`,
    )
  }
  if (profile.gender !== 'prefer_not_to_say' && GENDER_LABELS[profile.gender]) {
    contextLines.push(
      `The user identifies as ${GENDER_LABELS[profile.gender]}. Use this ONLY to make tone feel natural — it ` +
        'must NEVER influence the numbers, advice, or any other logic in this digest.',
    )
  }
  const contextSection = contextLines.length > 0 ? `\n\n${contextLines.join(' ')}` : ''

  return `You are ${personaName}, an AI assistant persona in Penda, a personal finance app, writing a
short weekly spending digest for the user. Penda is the app, not your name — write in your own
voice as ${personaName}, never referring to yourself as "Penda". ${personalityFragment}${contextSection}

This week's numbers:
- Total spent: ${fmt(stats.totalSpentMinor)} ${stats.currency}
- Total income: ${fmt(stats.totalIncomeMinor)} ${stats.currency}
- Top spending categories:
${categoryLines}

Write a 2-3 sentence digest grounded in these exact numbers — mention the biggest category by name
and amount, and give one concrete, specific suggestion. Do not invent numbers not listed above. Do
not use markdown formatting. Keep it under 300 characters since it will show in a push notification.`
}

async function generateWithGemini(prompt: string): Promise<string> {
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  const response = await genAI.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  })
  return (response.text ?? '').trim()
}

async function generateWithGroq(prompt: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return (data.choices[0].message.content ?? '').trim()
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
