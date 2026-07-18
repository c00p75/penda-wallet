import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { notifyUser } from '../_shared/notify.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { mapLimit } from '../_shared/concurrency.ts'
import { loadEngagement, shouldSkipSoftNudge } from '../_shared/engagement.ts'
import { normalizeNotificationPrefs } from '../_shared/notifyPrefs.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, notification_opt_in, notification_prefs, engagement_stats')
      .eq('notification_opt_in', true)

    if (error) throw error

    const today = utcDateStr(new Date())
    const results = await mapLimit(profiles ?? [], 8, async (profile) => {
      try {
        return await sendMorningMinute(supabase, profile, today)
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
  },
  today: string,
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
    .select('type, amount_minor, converted_amount_minor')
    .eq('wallet_id', walletId)
    .eq('user_confirmed', true)
    .is('deleted_at', null)
    .gte('transaction_date', monthStart)

  let income = 0
  let expense = 0
  for (const tx of txs ?? []) {
    const amt = Number(tx.converted_amount_minor ?? tx.amount_minor ?? 0)
    if (tx.type === 'income') income += amt
    else if (tx.type === 'expense') expense += amt
  }
  const net = income - expense

  const tomorrow = utcDateStr(new Date(Date.now() + 86_400_000))
  const { data: bills } = await supabase
    .from('recurring_transactions')
    .select('id')
    .eq('wallet_id', walletId)
    .eq('is_active', true)
    .in('next_run_date', [today, tomorrow])

  const billCount = bills?.length ?? 0
  const netLabel = formatMinor(net, currency)
  const body =
    billCount > 0
      ? `Month-to-date net ${netLabel}. ${billCount} bill${billCount === 1 ? '' : 's'} due today or tomorrow — open Penda when you have a minute.`
      : `Month-to-date net ${netLabel}. No bills due today or tomorrow — a calm start.`

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

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
