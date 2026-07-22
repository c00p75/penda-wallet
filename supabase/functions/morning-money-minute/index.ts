import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { GoogleGenAI } from 'npm:@google/genai@2.11.0'
import { notifyUser } from '../_shared/notify.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { mapLimit } from '../_shared/concurrency.ts'
import { loadEngagement, shouldSkipSoftNudge } from '../_shared/engagement.ts'
import { normalizeNotificationPrefs } from '../_shared/notifyPrefs.ts'
import {
  GENDER_LABELS,
  GOAL_LABELS,
  MODE_AI_CONTEXT,
  PERSONALITY_NAMES,
  PERSONALITY_PROMPTS,
  resolvePersonality,
} from '../_shared/personas.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const MODEL_TIMEOUT_MS = 12_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select(
        'id, notification_opt_in, notification_prefs, engagement_stats, ai_personality, primary_goal, primary_goals, gender, mode',
      )
      .eq('notification_opt_in', true)

    if (error) throw error

    const today = utcDateStr(new Date())

    // LLM personalization is a Premium enhancement: only premium members get a
    // model call each morning, everyone else still gets the data-grounded
    // template line. One entitlements query up front (not per user) bounds the
    // daily model spend to the premium cohort.
    const premiumIds = await fetchPremiumIds(
      supabase,
      (profiles ?? []).map((p) => p.id),
    )

    const results = await mapLimit(profiles ?? [], 8, async (profile) => {
      try {
        return await sendMorningMinute(supabase, profile, today, premiumIds.has(profile.id))
      } catch (err) {
        console.error(
          `Morning minute failed for ${profile.id}:`,
          err instanceof Error ? err.message : String(err),
        )
        return { userId: profile.id, error: 'failed' }
      }
    })

    return jsonResponse({ processed: results.length, results })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function sendMorningMinute(
  supabase: SupabaseClient,
  profile: {
    id: string
    notification_prefs: unknown
    engagement_stats: unknown
    ai_personality: string | null
    primary_goal: string | null
    primary_goals: unknown
    gender: string | null
    mode: string | null
  },
  today: string,
  isPremium: boolean,
) {
  const prefs = normalizeNotificationPrefs(profile.notification_prefs)
  if (!prefs.morning_minute || !prefs.tips) {
    return { userId: profile.id, skipped: 'prefs' }
  }

  const engagement = await loadEngagement(supabase, profile.id)
  if (shouldSkipSoftNudge(engagement)) {
    return { userId: profile.id, skipped: 'adaptive' }
  }

  const { data: membership } = await supabase
    .from('wallet_members')
    .select('wallet_id, wallets(base_currency)')
    .eq('user_id', profile.id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership?.wallet_id) return { userId: profile.id, skipped: 'no_wallet' }

  const walletId = membership.wallet_id as string
  const currency =
    (membership.wallets as unknown as { base_currency: string } | null)?.base_currency ?? ''

  const monthStart = today.slice(0, 8) + '01'
  const { data: txs } = await supabase
    .from('transactions')
    .select('type, amount_minor, converted_amount_minor, category:categories(name)')
    .eq('wallet_id', walletId)
    .eq('user_confirmed', true)
    .is('deleted_at', null)
    .gte('transaction_date', monthStart)

  let income = 0
  let expense = 0
  const categoryTotals = new Map<string, number>()
  for (const tx of txs ?? []) {
    const amt = Number(tx.converted_amount_minor ?? tx.amount_minor ?? 0)
    if (tx.type === 'income') {
      income += amt
    } else if (tx.type === 'expense') {
      expense += amt
      const name = (tx.category as unknown as { name: string } | null)?.name ?? 'Uncategorized'
      categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + amt)
    }
  }
  const net = income - expense

  // One personalization signal beyond net + bills: the month's biggest
  // spending category, so the line can name something concrete.
  let topCategory: { name: string; amountMinor: number } | null = null
  for (const [name, amountMinor] of categoryTotals) {
    if (!topCategory || amountMinor > topCategory.amountMinor) topCategory = { name, amountMinor }
  }

  const tomorrow = utcDateStr(new Date(Date.now() + 86_400_000))
  const { data: bills } = await supabase
    .from('recurring_transactions')
    .select('id')
    .eq('wallet_id', walletId)
    .eq('is_active', true)
    .in('next_run_date', [today, tomorrow])

  // One active savings goal (target set, not yet reached) so the line can nod
  // to real progress. Cheap per-user read, few goals per wallet.
  const { data: goals } = await supabase
    .from('savings_goals')
    .select('name, target_amount_minor, current_amount_minor')
    .eq('wallet_id', walletId)

  let topGoal: { name: string; percent: number } | null = null
  for (const g of goals ?? []) {
    const target = Number(g.target_amount_minor ?? 0)
    const current = Number(g.current_amount_minor ?? 0)
    if (target <= 0 || current >= target) continue
    const percent = Math.round((current / target) * 100)
    if (!topGoal || percent > topGoal.percent) topGoal = { name: g.name as string, percent }
  }

  const billCount = bills?.length ?? 0
  const netLabel = formatMinor(net, currency)

  // The existing templated line, kept verbatim as the guaranteed fallback so
  // this cron always notifies even when both model calls fail.
  const templateBody =
    billCount > 0
      ? `Month-to-date net ${netLabel}. ${billCount} bill${billCount === 1 ? '' : 's'} due today or tomorrow, open Penda when you have a minute.`
      : `Month-to-date net ${netLabel}. No bills due today or tomorrow, a calm start.`

  const body = isPremium
    ? await generateMoneyMinute(
        {
          netLabel,
          billCount,
          topCategory: topCategory
            ? { name: topCategory.name, label: formatMinor(topCategory.amountMinor, currency) }
            : null,
          topGoal,
          today,
        },
        {
          personality: profile.ai_personality ?? 'balanced_coach',
          primaryGoals: normalizeGoals(profile.primary_goals, profile.primary_goal),
          gender: profile.gender ?? 'prefer_not_to_say',
          mode: profile.mode ?? 'individual',
        },
        templateBody,
      )
    : templateBody

  const result = await notifyUser(supabase, {
    userId: profile.id,
    walletId,
    kind: 'tip',
    title: 'Morning money-minute',
    body,
    href: '/',
    dedupeKey: `morning-minute:${profile.id}:${today}`,
  })

  if (result.inserted) {
    await supabase
      .from('profiles')
      .update({
        engagement_stats: {
          ...engagement,
          last_ritual_at: new Date().toISOString(),
        },
      })
      .eq('id', profile.id)
  }

  return { userId: profile.id, inserted: result.inserted }
}

function formatMinor(amountMinor: number, currency: string): string {
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

interface MorningStats {
  netLabel: string
  billCount: number
  topCategory: { name: string; label: string } | null
  topGoal: { name: string; percent: number } | null
  today: string
}

interface MorningProfileContext {
  personality: string
  primaryGoals: string[]
  gender: string
  mode: string
}

/**
 * Persona-voiced one-line "money minute" grounded in the user's real numbers.
 * Gemini first, Groq on error, and the templated body if both fail so this
 * cron never goes silent.
 */
async function generateMoneyMinute(
  stats: MorningStats,
  profile: MorningProfileContext,
  fallbackBody: string,
): Promise<string> {
  const prompt = buildMoneyMinutePrompt(stats, profile)
  try {
    const text = await withTimeout(generateWithGemini(prompt), MODEL_TIMEOUT_MS, 'Gemini')
    if (text) return text
  } catch (error) {
    console.error(
      'Gemini money-minute generation failed, falling back to Groq:',
      error instanceof Error ? error.message : String(error),
    )
  }
  try {
    const text = await withTimeout(generateWithGroq(prompt), MODEL_TIMEOUT_MS, 'Groq')
    if (text) return text
  } catch (error) {
    console.error(
      'Groq money-minute generation failed, using template:',
      error instanceof Error ? error.message : String(error),
    )
  }
  return fallbackBody
}

function buildMoneyMinutePrompt(stats: MorningStats, profile: MorningProfileContext): string {
  const personality = resolvePersonality(profile.personality)
  const personalityFragment = PERSONALITY_PROMPTS[personality] ?? PERSONALITY_PROMPTS.balanced_coach
  const personaName = PERSONALITY_NAMES[personality] ?? PERSONALITY_NAMES.balanced_coach
  const modeFragment = MODE_AI_CONTEXT[profile.mode] ? ` ${MODE_AI_CONTEXT[profile.mode]}` : ''

  // Hard requirement, not a suggestion: gender may only ever shape tone here,
  // never the numbers or the advice, mirroring generate-insights and
  // chat-message.
  const contextLines: string[] = []
  const goalPhrases = profile.primaryGoals.map((g) => GOAL_LABELS[g]).filter(Boolean)
  if (goalPhrases.length > 0) {
    const isPlural = goalPhrases.length > 1
    contextLines.push(
      `Their stated primary financial ${isPlural ? 'goals' : 'goal'} right now ${
        isPlural ? 'are' : 'is'
      } to ${joinGoalPhrases(goalPhrases)}. Nod to ${isPlural ? 'them' : 'it'} where it fits naturally.`,
    )
  }
  if (profile.gender !== 'prefer_not_to_say' && GENDER_LABELS[profile.gender]) {
    contextLines.push(
      `The user identifies as ${GENDER_LABELS[profile.gender]}. Use this ONLY to make tone feel natural, it ` +
        'must NEVER influence the numbers, advice, or any other logic in this line.',
    )
  }
  const contextSection = contextLines.length > 0 ? `\n\n${contextLines.join(' ')}` : ''

  const signalLines: string[] = [
    `- Month-to-date net: ${stats.netLabel}`,
    `- Bills due today or tomorrow: ${stats.billCount}`,
  ]
  if (stats.topCategory) {
    signalLines.push(
      `- Biggest spending category this month: ${stats.topCategory.name} (${stats.topCategory.label})`,
    )
  }
  if (stats.topGoal) {
    signalLines.push(`- Active savings goal: ${stats.topGoal.name}, ${stats.topGoal.percent}% funded`)
  }

  return `You are ${personaName}, an AI assistant persona in Penda, a personal finance app, writing today's
one-line "money minute" for the user. Penda is the app, not your name, write in your own voice as
${personaName}, never referring to yourself as "Penda". ${personalityFragment}${modeFragment}${contextSection}

Today is ${stats.today}. The user's real numbers right now:
${signalLines.join('\n')}

Write ONE short, punchy line, at most 220 characters, since it shows in a push notification. Ground it in
the exact numbers above and reference at least one of them (the net, the bills, the named category, or the
goal). Do not invent numbers not listed above. Vary the angle so it never feels templated day to day. Do
not use markdown formatting. Do not use em dashes.`
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

// Bounds the worst case of a hung upstream call so one stalled model request
// can't tie up a slot in the fan-out for the whole function timeout.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ])
}

/** Prefer the multi-goal array; fall back to the legacy single goal column. */
function normalizeGoals(goals: unknown, legacy: string | null | undefined): string[] {
  if (Array.isArray(goals)) return goals.filter((g): g is string => typeof g === 'string')
  return legacy ? [legacy] : []
}

/** "a", "a and b", "a, b, and c" */
function joinGoalPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? ''
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`
}

/** Set of user ids on the premium plan (one query for the whole batch). */
async function fetchPremiumIds(supabase: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data, error } = await supabase
    .from('entitlements')
    .select('user_id')
    .in('user_id', ids)
    .eq('plan', 'premium')
  if (error) throw error
  return new Set((data ?? []).map((r) => r.user_id as string))
}

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
