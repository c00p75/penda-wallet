import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { GoogleGenAI } from 'npm:@google/genai@2.11.0'
import { corsHeadersFor } from '../_shared/cors.ts'
import { checkRateLimits } from '../_shared/rateLimit.ts'
import {
  GENDER_LABELS,
  GOAL_LABELS,
  MODE_AI_CONTEXT,
  PERSONALITY_NAMES,
  PERSONALITY_PROMPTS,
  resolvePersonality,
} from '../_shared/personas.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!

const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const MODEL_TIMEOUT_MS = 15_000

// How many days of spending to summarise for the model, and how many missions
// to ask for per tap. The client adds one and reuses the rest of the batch, so
// a small batch keeps taps varied without re-calling the model every time.
const HISTORY_DAYS = 45
const SUGGESTION_COUNT = 4
const MIN_DURATION_DAYS = 2
const MAX_DURATION_DAYS = 30

// A model call per tap, so bound it: a tight burst window plus a loose daily
// cap. Mirrors chat-message's shape; fails open on a DB hiccup (see rateLimit).
const RATE_LIMITS = {
  burst: { maxRequests: 12, windowMinutes: 5 },
  daily: { maxRequests: 80, windowMinutes: 60 * 24 },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CategoryTotal {
  category: string
  amountMinor: number
}

interface GoalContext {
  name: string
  targetMinor: number
  currentMinor: number
  targetDate: string | null
  motivation: string | null
}

interface ProfileContext {
  personality: string
  mode: string
  primaryGoals: string[]
  gender: string
}

interface WalletStats {
  currency: string
  totalSpentMinor: number
  totalIncomeMinor: number
  topCategories: CategoryTotal[]
  txCount: number
}

interface SuggestedMission {
  title: string
  description: string
  start_date: string
  end_date: string
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors })
  }
  const respond = (body: unknown, status = 200) => jsonResponse(body, cors, status)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return respond({ error: 'Missing Authorization header' }, 401)
    }

    // Anon key + the caller's JWT, so every read below runs under the user's
    // RLS: they only ever see their own wallet's transactions, goals, missions.
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return respond({ error: 'Invalid or expired session' }, 401)
    }

    const limitMessage = await checkRateLimits(supabase, user.id, 'generate-mission-suggestions', RATE_LIMITS)
    if (limitMessage) {
      return respond({ error: limitMessage }, 429)
    }

    const body = (await req.json().catch(() => ({}))) as { walletId?: unknown }
    const walletId = body.walletId
    if (typeof walletId !== 'string' || !UUID_RE.test(walletId)) {
      return respond({ error: 'walletId must be a UUID' }, 400)
    }

    // Independent reads, fan out.
    const [stats, goals, activeTitles, profile] = await Promise.all([
      fetchWalletStats(supabase, walletId),
      fetchGoals(supabase, walletId),
      fetchActiveMissionTitles(supabase, walletId),
      fetchProfile(supabase, user.id),
    ])

    // Nothing to personalise from: no spending logged and no goals set. A
    // suggestion here would be a generic guess, so tell the client, which
    // falls back to its built-in starter ideas instead.
    if (stats.txCount === 0 && goals.length === 0) {
      return respond({ error: 'not_enough_data', suggestions: [] }, 422)
    }

    const prompt = buildPrompt(stats, goals, activeTitles, profile)

    let missions: Array<{ title: string; description: string; duration_days: number }>
    try {
      missions = await withTimeout(generateWithGemini(prompt), MODEL_TIMEOUT_MS, 'Gemini')
    } catch (error) {
      console.error('Gemini mission generation failed, falling back to Groq:', errMessage(error))
      missions = await withTimeout(generateWithGroq(prompt), MODEL_TIMEOUT_MS, 'Groq')
    }

    const suggestions = toSuggestions(missions, activeTitles)
    if (suggestions.length === 0) {
      // Model answered but produced nothing usable, let the client fall back.
      return respond({ error: 'generation_failed', suggestions: [] }, 502)
    }

    return respond({ suggestions })
  } catch (error) {
    console.error(errMessage(error))
    return respond({ error: 'Something went wrong on our side. Please try again.' }, 500)
  }
})

// --- Data ------------------------------------------------------------------

async function fetchWalletStats(supabase: SupabaseClient, walletId: string): Promise<WalletStats> {
  const currency = await fetchWalletCurrency(supabase, walletId)
  const since = daysAgo(HISTORY_DAYS)

  const { data, error } = await supabase
    .from('transactions')
    .select('amount_minor, converted_amount_minor, type, category:categories(name)')
    .eq('wallet_id', walletId)
    .eq('user_confirmed', true)
    .is('deleted_at', null)
    .gte('transaction_date', since)
  if (error) throw error

  const transactions = data ?? []
  let totalSpentMinor = 0
  let totalIncomeMinor = 0
  const categoryTotals = new Map<string, number>()

  for (const t of transactions) {
    // Prefer the wallet-currency converted amount so multi-currency wallets
    // don't mix raw foreign figures into the totals.
    const amount = Number(t.converted_amount_minor ?? t.amount_minor ?? 0)
    if (t.type === 'expense') {
      totalSpentMinor += amount
      const name = (t.category as unknown as { name: string } | null)?.name ?? 'Uncategorized'
      categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + amount)
    } else if (t.type === 'income') {
      totalIncomeMinor += amount
    }
  }

  const topCategories: CategoryTotal[] = Array.from(categoryTotals.entries())
    .map(([category, amountMinor]) => ({ category, amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .slice(0, 6)

  return { currency, totalSpentMinor, totalIncomeMinor, topCategories, txCount: transactions.length }
}

async function fetchWalletCurrency(supabase: SupabaseClient, walletId: string): Promise<string> {
  const { data } = await supabase.from('wallets').select('base_currency').eq('id', walletId).maybeSingle()
  return data?.base_currency ?? 'USD'
}

async function fetchGoals(supabase: SupabaseClient, walletId: string): Promise<GoalContext[]> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('name, target_amount_minor, current_amount_minor, target_date, motivation')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: true })
    .limit(8)
  if (error) throw error
  return (data ?? []).map((g) => ({
    name: g.name,
    targetMinor: Number(g.target_amount_minor ?? 0),
    currentMinor: Number(g.current_amount_minor ?? 0),
    targetDate: g.target_date ?? null,
    motivation: g.motivation ?? null,
  }))
}

async function fetchActiveMissionTitles(supabase: SupabaseClient, walletId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('financial_missions')
    .select('title')
    .eq('wallet_id', walletId)
    .eq('status', 'active')
    .limit(20)
  if (error) throw error
  return (data ?? []).map((m) => m.title as string)
}

async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<ProfileContext> {
  const { data } = await supabase
    .from('profiles')
    .select('ai_personality, mode, primary_goal, primary_goals, gender')
    .eq('id', userId)
    .maybeSingle()
  return {
    personality: data?.ai_personality ?? 'balanced_coach',
    mode: data?.mode ?? 'individual',
    primaryGoals: normalizeGoals(data?.primary_goals, data?.primary_goal),
    gender: data?.gender ?? 'prefer_not_to_say',
  }
}

/** Prefer the multi-goal array; fall back to the legacy single goal column. */
function normalizeGoals(goals: unknown, legacy: string | null | undefined): string[] {
  if (Array.isArray(goals)) return goals.filter((g): g is string => typeof g === 'string')
  return legacy ? [legacy] : []
}

// --- Prompt ----------------------------------------------------------------

/** "a", "a and b", "a, b, and c" */
function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? ''
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`
}

function buildPrompt(
  stats: WalletStats,
  goals: GoalContext[],
  activeTitles: string[],
  profile: ProfileContext,
): string {
  const fmt = (minor: number) => `${(minor / 100).toFixed(0)} ${stats.currency}`
  const personality = resolvePersonality(profile.personality)
  const personaName = PERSONALITY_NAMES[personality] ?? PERSONALITY_NAMES.balanced_coach
  const personaFragment = PERSONALITY_PROMPTS[personality] ?? PERSONALITY_PROMPTS.balanced_coach
  const modeFragment = MODE_AI_CONTEXT[profile.mode] ?? MODE_AI_CONTEXT.individual

  const categoryLines = stats.topCategories.length
    ? stats.topCategories.map((c) => `- ${c.category}: ${fmt(c.amountMinor)}`).join('\n')
    : '- (no categorised spending yet)'

  const goalLines = goals.length
    ? goals
        .map((g) => {
          const pct = g.targetMinor > 0 ? Math.round((g.currentMinor / g.targetMinor) * 100) : 0
          const parts = [`- "${g.name}": ${fmt(g.currentMinor)} of ${fmt(g.targetMinor)} saved (${pct}%)`]
          if (g.targetDate) parts.push(`target date ${g.targetDate}`)
          if (g.motivation) parts.push(`why it matters: ${g.motivation}`)
          return parts.join(', ')
        })
        .join('\n')
    : '- (no savings goals set)'

  const onboardingGoalPhrases = profile.primaryGoals.map((g) => GOAL_LABELS[g]).filter(Boolean)
  const onboardingLine =
    onboardingGoalPhrases.length > 0
      ? `\nWhen they set up Penda they said their priority right now is to ${joinPhrases(onboardingGoalPhrases)}.`
      : ''

  const genderLine =
    profile.gender !== 'prefer_not_to_say' && GENDER_LABELS[profile.gender]
      ? `\nThe user identifies as ${GENDER_LABELS[profile.gender]}. Use this ONLY to make tone feel natural, ` +
        'it must NEVER influence the substance of the missions.'
      : ''

  const avoidLine = activeTitles.length
    ? `\n\nThey ALREADY have these active missions, do NOT repeat or lightly reword any of them:\n${activeTitles
        .map((t) => `- ${t}`)
        .join('\n')}`
    : ''

  return `You are ${personaName}, an AI money companion inside Penda, a personal finance app. ${personaFragment}
${modeFragment}${onboardingLine}${genderLine}

You are designing short "financial missions" for this specific user. A mission is a small, concrete,
time-boxed behavioural challenge (a few days to a few weeks) that nudges them toward better money
habits, for example a no-spend streak in a category they overspend, a cash-only stretch, cooking at
home, a mini savings sprint toward a goal, or a "no impulse buys after 9pm" rule.

Here is what you actually know about this user (last ${HISTORY_DAYS} days):
- Total spent: ${fmt(stats.totalSpentMinor)}
- Total income: ${fmt(stats.totalIncomeMinor)}
- Top spending categories:
${categoryLines}

Their savings goals:
${goalLines}${onboardingLine ? '' : ''}${avoidLine}

Design exactly ${SUGGESTION_COUNT} DISTINCT missions tailored to THIS user's real data above. Rules:
- Ground each mission in their actual numbers, categories, or goals. Reference the real category or
  goal name where it fits. Do not invent spending or goals that are not listed.
- Make the ${SUGGESTION_COUNT} missions genuinely different from each other (vary the category, the
  tactic, and the length). Do not just change the number of days on the same idea.
- Each must be achievable and specific, not vague advice like "spend less".
- duration_days must be a whole number between ${MIN_DURATION_DAYS} and ${MAX_DURATION_DAYS}.
- title: under 42 characters, punchy, no quotation marks.
- description: 1-2 sentences, under 180 characters, written in your own voice as ${personaName}. Say
  what to do and why it helps them specifically. Do not use markdown or the em dash character.

Respond with ONLY a JSON object in exactly this shape, no prose, no code fences:
{"missions":[{"title":"...","description":"...","duration_days":7}]}`
}

// --- Model calls -----------------------------------------------------------

interface RawMission {
  title: string
  description: string
  duration_days: number
}

async function generateWithGemini(prompt: string): Promise<RawMission[]> {
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  const response = await genAI.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' },
  })
  return parseMissions(response.text ?? '')
}

async function generateWithGroq(prompt: string): Promise<RawMission[]> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return parseMissions(data.choices?.[0]?.message?.content ?? '')
}

/** Tolerant parse: strip any code fences, pull the first JSON object, read .missions. */
function parseMissions(raw: string): RawMission[] {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return []
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return []
    }
  }
  const list =
    Array.isArray(parsed) ? parsed : (parsed as { missions?: unknown })?.missions
  if (!Array.isArray(list)) return []
  return list
    .map((m) => {
      const item = m as Record<string, unknown>
      return {
        title: typeof item.title === 'string' ? item.title : '',
        description: typeof item.description === 'string' ? item.description : '',
        duration_days: Number(item.duration_days),
      }
    })
    .filter((m) => m.title && m.description)
}

// --- Shaping ---------------------------------------------------------------

/** Validate, de-dupe against existing missions, and stamp concrete dates. */
function toSuggestions(missions: RawMission[], activeTitles: string[]): SuggestedMission[] {
  const start = today()
  const seen = new Set(activeTitles.map(normTitle))
  const out: SuggestedMission[] = []

  for (const m of missions) {
    const title = m.title.trim().replace(/^["']|["']$/g, '')
    const description = m.description.trim()
    if (!title || !description) continue

    const key = normTitle(title)
    if (seen.has(key)) continue
    seen.add(key)

    const days = clampDuration(m.duration_days)
    out.push({
      title,
      description,
      start_date: start,
      end_date: addDays(start, days - 1),
    })
    if (out.length >= SUGGESTION_COUNT) break
  }
  return out
}

function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return 7
  return Math.min(MAX_DURATION_DAYS, Math.max(MIN_DURATION_DAYS, Math.round(value)))
}

function normTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// --- Utils -----------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ])
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function jsonResponse(body: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
