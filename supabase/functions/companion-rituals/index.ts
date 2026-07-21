import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { notifyUser } from '../_shared/notify.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { mapLimit } from '../_shared/concurrency.ts'
import { loadEngagement } from '../_shared/engagement.ts'
import { PERSONALITY_NAMES, resolvePersonality } from '../_shared/personas.ts'
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
    .select('user_id, profiles(ai_personality, companion_prefs, notification_opt_in)')
    .eq('wallet_id', walletId)

  const premiumOrAny = members ?? []
  if (premiumOrAny.length === 0) return { walletId, skipped: 'no_members' }

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
    } | null
    const prefs = normalizeCompanionPrefs(profile?.companion_prefs)
    if (!prefs.weekly_letter) {
      results.push({ userId: m.user_id, skipped: 'prefs' })
      continue
    }

    const persona =
      PERSONALITY_NAMES[resolvePersonality(profile?.ai_personality)] ?? 'Amara'
    const netLabel = formatMinor(Math.abs(net), currency)
    const body = [
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

    // Also stash as a journal note for continuity.
    await supabase.from('ai_memories').insert({
      user_id: m.user_id,
      wallet_id: walletId,
      kind: 'note',
      content: body,
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
