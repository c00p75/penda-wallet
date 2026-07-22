import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { GoogleGenAI } from 'npm:@google/genai@2.11.0'
import { notifyUser } from '../_shared/notify.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { mapLimit } from '../_shared/concurrency.ts'
import { loadEngagement } from '../_shared/engagement.ts'
import {
  GOAL_LABELS,
  PERSONALITY_NAMES,
  PERSONALITY_PROMPTS,
  resolvePersonality,
} from '../_shared/personas.ts'
import { normalizeCompanionPrefs } from '../_shared/companionPrefs.ts'
import {
  classifyPactFollowUp,
  companionRitualSkipReason,
  cronSecretAuthorized,
  daysAgo,
  midpointDate,
} from '../_shared/companionRitualGating.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!

const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
// Cron reliability: cap any single model call so one hung request can't stall
// the whole weekly fan-out. On timeout we fall through Gemini -> Groq -> template.
const MODEL_TIMEOUT_MS = 12_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (!cronSecretAuthorized(req.headers.get('X-Cron-Secret'), CRON_SECRET)) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  let job = 'daily'
  try {
    const body = await req.json().catch(() => ({}))
    if (body && typeof body.job === 'string') job = body.job
  } catch {
    /* empty body ok */
  }

  try {
    if (job === 'weekly_letter') {
      const results = await runWeeklyLetters(supabase)
      return jsonResponse({ job, processed: results.length, results })
    }
    const results = await runDailyRituals(supabase)
    return jsonResponse({ job: 'daily', processed: results.length, results })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function runDailyRituals(supabase: SupabaseClient) {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, ai_personality, mode, companion_prefs, notification_opt_in, engagement_stats')
  if (error) throw error

  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  return mapLimit(profiles ?? [], 6, async (profile) => {
    try {
      return await ritualForUser(supabase, profile, today, now)
    } catch (err) {
      console.error(`Companion ritual failed for ${profile.id}:`, err)
      return { userId: profile.id, error: 'failed' }
    }
  })
}

async function ritualForUser(
  supabase: SupabaseClient,
  profile: {
    id: string
    ai_personality: string | null
    mode: string | null
    companion_prefs: unknown
    engagement_stats: unknown
  },
  today: string,
  now: Date,
) {
  const prefs = normalizeCompanionPrefs(profile.companion_prefs)
  const engagement = await loadEngagement(supabase, profile.id)

  const { data: moodRows } = await supabase
    .from('ai_memories')
    .select('kind, content, mood, created_at')
    .eq('user_id', profile.id)
    .eq('kind', 'mood')
    .order('created_at', { ascending: false })
    .limit(5)

  const skip = companionRitualSkipReason({
    engagement,
    prefs,
    hour: now.getUTCHours(),
    dayOfWeek: now.getUTCDay(),
    moodMemories: moodRows ?? [],
    now,
  })
  if (skip) {
    return { userId: profile.id, skipped: skip }
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

  const sent: string[] = []

  if (prefs.pact_follow_up) {
    const n = await sendPactFollowUps(supabase, profile.id, walletId, today)
    if (n) sent.push('pact')
  }

  if (prefs.payday_companion) {
    const n = await sendPaydayCompanion(supabase, profile.id, walletId, currency, today)
    if (n) sent.push('payday')
  }

  if (prefs.family_nudges && profile.mode === 'family') {
    const n = await sendFamilyNudge(supabase, profile.id, walletId, currency, today)
    if (n) sent.push('family')
  }

  return { userId: profile.id, sent }
}

async function sendPactFollowUps(
  supabase: SupabaseClient,
  userId: string,
  walletId: string,
  today: string,
): Promise<boolean> {
  const { data: pacts } = await supabase
    .from('commitment_pacts')
    .select('id, description, category_id, start_date, end_date')
    .eq('wallet_id', walletId)
    .gte('end_date', today)

  if (!pacts?.length) return false

  const { data: txs } = await supabase
    .from('transactions')
    .select('type, category_id, transaction_date')
    .eq('wallet_id', walletId)
    .eq('type', 'expense')
    .eq('user_confirmed', true)
    .is('deleted_at', null)
    .gte('transaction_date', daysAgo(today, 60))

  let any = false
  for (const pact of pacts) {
    const broken = (txs ?? []).some(
      (tx) =>
        tx.category_id === pact.category_id &&
        tx.transaction_date >= pact.start_date &&
        tx.transaction_date <= pact.end_date,
    )
    const kind = classifyPactFollowUp({
      today,
      startDate: pact.start_date,
      endDate: pact.end_date,
      broken,
    })
    let message = ''
    if (kind === 'broken') {
      message = `Your pact "${pact.description}" got tested. Want to reset it, or talk through what happened?`
    } else if (kind === 'midpoint') {
      message = `Halfway through "${pact.description}". Still holding?`
    } else if (kind === 'end') {
      message = `You made it through "${pact.description}". Want to set the next one?`
    }
    if (!kind) continue

    const dedupeKey = `pact-follow:${pact.id}:${kind}:${today}`
    const inserted = await insertCheckin(supabase, {
      userId,
      walletId,
      kind: 'pact',
      refId: pact.id,
      message,
      dedupeKey,
      payload: { pactKind: kind },
    })
    if (inserted) {
      await notifyUser(supabase, {
        userId,
        walletId,
        kind: 'tip',
        title: 'Pact check-in',
        body: message,
        href: '/',
        dedupeKey,
      })
      any = true
    }
  }
  return any
}

async function sendPaydayCompanion(
  supabase: SupabaseClient,
  userId: string,
  walletId: string,
  currency: string,
  today: string,
): Promise<boolean> {
  const { data: recurring } = await supabase
    .from('recurring_transactions')
    .select('next_run_date, template')
    .eq('wallet_id', walletId)
    .eq('is_active', true)

  const nextIncome = (recurring ?? [])
    .filter((r) => {
      const t = r.template as { type?: string } | null
      return t?.type === 'income' && typeof r.next_run_date === 'string'
    })
    .map((r) => r.next_run_date as string)
    .sort()[0]

  if (!nextIncome) return false
  const days = daysBetween(today, nextIncome)
  let phase: 'pre' | 'day' | 'post' | null = null
  if (days === 1 || days === 2) phase = 'pre'
  else if (days === 0) phase = 'day'
  else if (days === -1 || days === -2) phase = 'post'
  if (!phase) return false

  let cashGone = false
  if (phase === 'day' || phase === 'post') {
    const { data: balTxs } = await supabase
      .from('transactions')
      .select('type, amount_minor, converted_amount_minor')
      .eq('wallet_id', walletId)
      .eq('user_confirmed', true)
      .is('deleted_at', null)
    const balance = (balTxs ?? []).reduce((sum, tx) => {
      const amt = Number(tx.converted_amount_minor ?? tx.amount_minor ?? 0)
      if (tx.type === 'income') return sum + amt
      if (tx.type === 'expense') return sum - amt
      return sum
    }, 0)
    cashGone = balance <= 0
  }

  const message =
    phase === 'pre'
      ? `Payday is near (${nextIncome}). Want a short pre-payday plan?`
      : cashGone
        ? `Payday cash looks spent already. Want a catch-up plan for the rest of the period?`
        : phase === 'day'
          ? `Payday today. Shall we allocate bills, buffer, and fun money?`
          : `Payday just landed. Did you set aside savings first?`

  const dedupeKey = `payday:${phase}:${nextIncome}`
  const inserted = await insertCheckin(supabase, {
    userId,
    walletId,
    kind: 'payday',
    refId: nextIncome,
    message,
    dedupeKey,
    payload: { phase, currency },
  })
  if (!inserted) return false

  await notifyUser(supabase, {
    userId,
    walletId,
    kind: 'tip',
    title: phase === 'day' ? 'Payday' : 'Payday companion',
    body: message,
    href: '/cashflow',
    dedupeKey,
  })
  return true
}

async function sendFamilyNudge(
  supabase: SupabaseClient,
  userId: string,
  walletId: string,
  currency: string,
  today: string,
): Promise<boolean> {
  const { data: goals } = await supabase
    .from('savings_goals')
    .select('id, name, current_amount_minor, target_amount_minor')
    .eq('wallet_id', walletId)

  const allowance = (goals ?? []).find((g) => /allowance|pocket|kids?/i.test(g.name ?? ''))
  if (!allowance || !allowance.target_amount_minor) return false
  const remaining = allowance.target_amount_minor - allowance.current_amount_minor
  const pct = allowance.current_amount_minor / allowance.target_amount_minor
  if (remaining <= 0 || pct < 0.85) return false

  const message = `${allowance.name} has about ${formatMinor(remaining, currency)} left this period.`
  const dedupeKey = `family-allowance:${allowance.id}:${today.slice(0, 7)}`
  const inserted = await insertCheckin(supabase, {
    userId,
    walletId,
    kind: 'family',
    refId: allowance.id,
    message,
    dedupeKey,
    payload: {},
  })
  if (!inserted) return false

  await notifyUser(supabase, {
    userId,
    walletId,
    kind: 'tip',
    title: 'Family update',
    body: message,
    href: '/family',
    dedupeKey,
  })
  return true
}

async function runWeeklyLetters(supabase: SupabaseClient) {
  const { data: wallets, error } = await supabase.from('wallets').select('id, base_currency')
  if (error) throw error

  const periodEnd = utcDateStr(new Date())
  const periodStart = daysAgo(periodEnd, 7)

  return mapLimit(wallets ?? [], 4, async (wallet) => {
    try {
      return await letterForWallet(supabase, wallet.id, wallet.base_currency, periodStart, periodEnd)
    } catch (err) {
      console.error(`Weekly letter failed for ${wallet.id}:`, err)
      return { walletId: wallet.id, error: 'failed' }
    }
  })
}

async function letterForWallet(
  supabase: SupabaseClient,
  walletId: string,
  currency: string,
  periodStart: string,
  periodEnd: string,
) {
  const { data: members } = await supabase
    .from('wallet_members')
    .select(
      'user_id, profiles(ai_personality, companion_prefs, notification_opt_in, primary_goals, primary_goal)',
    )
    .eq('wallet_id', walletId)

  const premiumOrAny = members ?? []
  if (premiumOrAny.length === 0) return { walletId, skipped: 'no_members' }

  // Mirror sendFamilyNudge's savings_goals query. There is no status column, so
  // an "active" goal is one with a positive target the wallet hasn't hit yet.
  // Newest first so the letter's next move points at what the user is chasing now.
  const { data: goals } = await supabase
    .from('savings_goals')
    .select('id, name, current_amount_minor, target_amount_minor')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false })

  const activeGoal = (goals ?? []).find(
    (g) =>
      Number(g.target_amount_minor) > 0 &&
      Number(g.current_amount_minor) < Number(g.target_amount_minor),
  )
  const goalContext = activeGoal
    ? {
        name: activeGoal.name as string,
        pct: Math.round(
          (Number(activeGoal.current_amount_minor) / Number(activeGoal.target_amount_minor)) * 100,
        ),
      }
    : null

  const [{ data: txs }, { data: balTxs }] = await Promise.all([
    supabase
      .from('transactions')
      .select('type, amount_minor, converted_amount_minor, category_id, categories(name)')
      .eq('wallet_id', walletId)
      .eq('user_confirmed', true)
      .is('deleted_at', null)
      .gte('transaction_date', periodStart)
      .lte('transaction_date', periodEnd),
    supabase
      .from('transactions')
      .select('type, amount_minor, converted_amount_minor')
      .eq('wallet_id', walletId)
      .eq('user_confirmed', true)
      .is('deleted_at', null),
  ])

  let income = 0
  let expense = 0
  const byCat = new Map<string, number>()
  for (const tx of txs ?? []) {
    const amt = Number(tx.converted_amount_minor ?? tx.amount_minor ?? 0)
    if (tx.type === 'income') income += amt
    else if (tx.type === 'expense') {
      expense += amt
      const name =
        (tx.categories as unknown as { name: string } | null)?.name ?? 'Other'
      byCat.set(name, (byCat.get(name) ?? 0) + amt)
    }
  }

  const balanceMinor = (balTxs ?? []).reduce((sum, tx) => {
    const amt = Number(tx.converted_amount_minor ?? tx.amount_minor ?? 0)
    if (tx.type === 'income') return sum + amt
    if (tx.type === 'expense') return sum - amt
    return sum
  }, 0)

  let topCategoryName: string | null = null
  let topCategoryMinor = 0
  for (const [name, amt] of byCat) {
    if (amt > topCategoryMinor) {
      topCategoryName = name
      topCategoryMinor = amt
    }
  }

  const net = income - expense
  const results = []

  for (const m of premiumOrAny) {
    const profile = m.profiles as unknown as {
      ai_personality?: string
      companion_prefs?: unknown
      notification_opt_in?: boolean
      primary_goals?: unknown
      primary_goal?: string | null
    } | null
    const prefs = normalizeCompanionPrefs(profile?.companion_prefs)
    if (!prefs.weekly_letter) {
      results.push({ userId: m.user_id, skipped: 'prefs' })
      continue
    }

    const personality = resolvePersonality(profile?.ai_personality)
    const persona = PERSONALITY_NAMES[personality] ?? 'Amara'
    const netLabel = formatMinor(Math.abs(net), currency)

    // Deterministic fallback body, the pre-AI templated copy kept verbatim, so
    // the letter still sends when BOTH models fail (cron reliability).
    const fallbackBody = [
      `Hey. ${persona} here with your week (${periodStart} → ${periodEnd}).`,
      net >= 0
        ? `You came out ~${netLabel} ahead.`
        : `This week ran ~${netLabel} short.`,
      topCategoryName
        ? `Biggest slice: ${topCategoryName} at ${formatMinor(topCategoryMinor, currency)}.`
        : null,
      net >= 0
        ? balanceMinor > 0
          ? 'One next move: park a slice of the surplus toward a goal.'
          : 'Week looked ahead on paper, but cash looks tight now. Want a catch-up plan?'
        : 'One next move: pick one leak to cut this week, open chat and we’ll choose together.',
    ]
      .filter(Boolean)
      .join(' ')

    const goalPhrases = normalizeGoals(profile?.primary_goals, profile?.primary_goal)
      .map((g) => GOAL_LABELS[g])
      .filter(Boolean)

    const prompt = buildLetterPrompt({
      personaName: persona,
      personalityFragment: PERSONALITY_PROMPTS[personality] ?? PERSONALITY_PROMPTS.balanced_coach,
      currency,
      periodStart,
      periodEnd,
      income,
      expense,
      net,
      topCategoryName,
      topCategoryMinor,
      goal: goalContext,
      goalPhrases,
    })

    // AI-written, persona-voiced letter grounded in the real weekly numbers.
    // Gemini first, Groq on error, and the template if both fail so a send is
    // never lost.
    let body: string
    try {
      body = (await generateLetterBody(prompt)) || fallbackBody
    } catch (err) {
      console.error(`Weekly letter model calls failed for ${m.user_id}, using template:`, err)
      body = fallbackBody
    }

    const title = `A note from ${persona}`
    const { error: insertError } = await supabase.from('companion_letters').insert({
      user_id: m.user_id,
      wallet_id: walletId,
      title,
      body,
      period_start: periodStart,
      period_end: periodEnd,
    })
    if (insertError) {
      results.push({ userId: m.user_id, error: insertError.message })
      continue
    }

    // Stash a SHORT factual summary for continuity, NOT the letter prose. This
    // note feeds the chat assistant's memory prompt (chat-message
    // fetchMemories), so storing the full letter would pollute future replies.
    const netSummary = net >= 0 ? `${netLabel} ahead` : `${netLabel} short`
    await supabase.from('ai_memories').insert({
      user_id: m.user_id,
      wallet_id: walletId,
      kind: 'note',
      content:
        `Weekly companion letter sent (${periodStart}→${periodEnd}): ` +
        `net ${netSummary}, top category ${topCategoryName ?? 'none'}.`,
      mood: null,
    })

    const dedupeKey = `weekly-letter:${walletId}:${periodEnd}`
    await insertCheckin(supabase, {
      userId: m.user_id,
      walletId,
      kind: 'weekly_letter',
      refId: periodEnd,
      message: title + ': ' + body.slice(0, 160),
      dedupeKey,
      payload: { title, body },
    })

    await notifyUser(supabase, {
      userId: m.user_id,
      walletId,
      kind: 'insight',
      title,
      body: body.slice(0, 180),
      href: '/',
      dedupeKey,
    })

    results.push({ userId: m.user_id, ok: true })
  }

  return { walletId, results }
}

async function insertCheckin(
  supabase: SupabaseClient,
  opts: {
    userId: string
    walletId: string
    kind: string
    refId: string | null
    message: string
    dedupeKey: string
    payload: Record<string, unknown>
  },
): Promise<boolean> {
  const { error } = await supabase.from('companion_checkins').insert({
    user_id: opts.userId,
    wallet_id: opts.walletId,
    kind: opts.kind,
    ref_id: opts.refId,
    message: opts.message,
    status: 'pending',
    due_at: new Date().toISOString(),
    dedupe_key: opts.dedupeKey,
    payload: opts.payload,
  })
  if (error) {
    if (error.code === '23505') return false
    console.error('insertCheckin', error.message)
    return false
  }
  return true
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatMinor(amountMinor: number, currency: string): string {
  const major = amountMinor / 100
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(major)
  } catch {
    return `${currency} ${major.toFixed(0)}`
  }
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

function buildLetterPrompt(opts: {
  personaName: string
  personalityFragment: string
  currency: string
  periodStart: string
  periodEnd: string
  income: number
  expense: number
  net: number
  topCategoryName: string | null
  topCategoryMinor: number
  goal: { name: string; pct: number } | null
  goalPhrases: string[]
}): string {
  const money = (minor: number) => formatMinor(minor, opts.currency)
  const netLine =
    opts.net >= 0
      ? `Net: ${money(opts.net)} ahead for the week.`
      : `Net: ${money(Math.abs(opts.net))} short for the week.`
  const topLine = opts.topCategoryName
    ? `Top spending category: ${opts.topCategoryName} at ${money(opts.topCategoryMinor)}.`
    : 'No standout spending category this week.'
  const goalLine = opts.goal
    ? `They have an active savings goal named "${opts.goal.name}", currently at ${opts.goal.pct}% of target. ` +
      'Make the one next move about progressing this goal, and name the goal.'
    : 'They have no active savings goal, so make the one next move a single concrete spending or saving action.'

  const goalContextLine =
    opts.goalPhrases.length > 0
      ? `Their stated primary financial ${opts.goalPhrases.length > 1 ? 'goals are' : 'goal is'} to ` +
        `${joinGoalPhrases(opts.goalPhrases)}. Connect the letter back to ${
          opts.goalPhrases.length > 1 ? 'them' : 'it'
        } where it fits naturally.\n`
      : ''

  return `You are ${opts.personaName}, an AI companion persona in Penda, a personal finance app, writing a
short, personal weekly letter to the user. Penda is the app, not your name, write in your own voice
as ${opts.personaName} and never refer to yourself as "Penda". ${opts.personalityFragment}
${goalContextLine}
This week (${opts.periodStart} to ${opts.periodEnd}):
- Income: ${money(opts.income)}
- Expenses: ${money(opts.expense)}
- ${netLine}
- ${topLine}
${goalLine}

Write the letter in your own voice as ${opts.personaName}: 3 to 5 sentences, under 500 characters.
Ground it in these exact numbers, name the top spending category and its amount, and close with one
concrete next move. Do not invent numbers not listed above. Do not use markdown formatting. Do not
use em dashes. Sign off with your name, ${opts.personaName}.`
}

async function generateLetterBody(prompt: string): Promise<string> {
  try {
    return await withTimeout(generateWithGemini(prompt), MODEL_TIMEOUT_MS, 'Gemini')
  } catch (error) {
    console.error('Gemini companion letter generation failed, falling back to Groq:', error)
    return await withTimeout(generateWithGroq(prompt), MODEL_TIMEOUT_MS, 'Groq')
  }
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

/** Cap a model call so a hung request can't stall the weekly fan-out. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
