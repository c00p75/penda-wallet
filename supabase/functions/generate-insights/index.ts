import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { GoogleGenAI } from 'npm:@google/genai@2.11.0'
import { sendPush } from '../_shared/push.ts'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

const PERSONALITY_PROMPTS: Record<string, string> = {
  balanced_coach: 'Your tone is warm, encouraging, and balanced — a supportive financial coach.',
  angry_mom: "Your tone is exasperated but loving, like a mom who's tired of seeing money wasted on takeout.",
  wise_mentor: 'Your tone is calm and reflective, offering perspective rather than judgment.',
  chill_friend: "Your tone is casual and easygoing, like a friend who's just keeping you honest.",
  drill_sergeant: 'Your tone is blunt and no-nonsense, pushing for discipline and accountability.',
  funny_comedian:
    'Your tone is playful and funny — a quick joke or witty aside, then real, useful guidance. ' +
    'Keep it light and never mean.',
  gen_z:
    'Your tone is a very-online Gen-Z best friend — high energy, casual slang, and genuine hype ' +
    'when the user does well. Keep emoji sparing and never let the vibe blur the point.',
  hustler:
    'Your tone is that of an entrepreneurial hustler with a growth mindset — framing money as ' +
    'something to grow, nudging toward earning more, while still respecting the budget.',
  gogo:
    'Your tone is that of a warm grandmother (gogo) — unhurried, wise, and frugal, fond of a short ' +
    'proverb and a save-for-the-rainy-day mindset. Gentle, never nagging.',
  analyst:
    'Your tone is that of a precise financial analyst: cold, quantitative, and to the point. Lead ' +
    'with the numbers and skip emotional framing. No fluff.',
}

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

    const results = []
    for (const wallet of wallets ?? []) {
      const result = await generateForWallet(supabase, wallet.id, wallet.base_currency, periodStart, periodEnd)
      results.push({ walletId: wallet.id, ...result })
    }

    return jsonResponse({ processed: results.length, results })
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

  const { data: members, error: membersError } = await supabase
    .from('wallet_members')
    .select('user_id')
    .eq('wallet_id', walletId)
  if (membersError) throw membersError

  const digestText = await generateDigestText(
    { totalSpentMinor, totalIncomeMinor, topCategories, currency },
    members?.[0]?.user_id ? await fetchPersonality(supabase, members[0].user_id) : 'balanced_coach',
  )

  const content = { text: digestText, total_spent_minor: totalSpentMinor, total_income_minor: totalIncomeMinor, top_categories: topCategories }

  // AI insights are a Premium feature — skip members on the free plan
  // entirely rather than generating content they can't see.
  let notified = 0
  for (const member of members ?? []) {
    const { data: isPremium } = await supabase.rpc('is_premium', { p_user_id: member.user_id })
    if (!isPremium) continue

    await supabase.from('ai_insights').insert({
      wallet_id: walletId,
      user_id: member.user_id,
      type: 'weekly_digest',
      content,
      period_start: periodStart,
      period_end: periodEnd,
    })

    await notifyMember(supabase, member.user_id, digestText)
    notified++
  }

  return { totalSpentMinor, totalIncomeMinor, topCategories, digestText, notified }
}

async function notifyMember(supabase: SupabaseClient, userId: string, digestText: string) {
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, keys')
    .eq('user_id', userId)

  for (const sub of subscriptions ?? []) {
    const result = await sendPush(
      { endpoint: sub.endpoint, keys: sub.keys },
      { title: 'Your weekly recap', body: digestText, url: '/insights' },
    )
    if (!result.ok && (result.statusCode === 404 || result.statusCode === 410)) {
      await supabase.from('push_subscriptions').delete().eq('id', sub.id)
    }
  }
}

async function fetchPersonality(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('ai_personality').eq('id', userId).maybeSingle()
  return data?.ai_personality ?? 'balanced_coach'
}

async function generateDigestText(
  stats: { totalSpentMinor: number; totalIncomeMinor: number; topCategories: CategoryTotal[]; currency: string },
  personality: string,
): Promise<string> {
  const prompt = buildPrompt(stats, personality)
  try {
    return await generateWithGemini(prompt)
  } catch (error) {
    console.error('Gemini insight generation failed, falling back to Groq:', error)
    return await generateWithGroq(prompt)
  }
}

function buildPrompt(
  stats: { totalSpentMinor: number; totalIncomeMinor: number; topCategories: CategoryTotal[]; currency: string },
  personality: string,
): string {
  const fmt = (minor: number) => (minor / 100).toFixed(2)
  const categoryLines = stats.topCategories
    .map((c) => `- ${c.category}: ${fmt(c.amount_minor)} ${stats.currency}`)
    .join('\n')

  const personalityFragment = PERSONALITY_PROMPTS[personality] ?? PERSONALITY_PROMPTS.balanced_coach

  return `You are Penda, an AI assistant for a personal finance app, writing a short weekly spending
digest for the user. ${personalityFragment}

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
