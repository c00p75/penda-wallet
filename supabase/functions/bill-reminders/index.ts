import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { notifyUser } from '../_shared/notify.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { mapLimit } from '../_shared/concurrency.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

interface RecurringRow {
  id: string
  wallet_id: string
  next_run_date: string
  template: {
    merchant?: string | null
    description?: string | null
    amount_minor?: number
    currency?: string
    type?: string
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  if (req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const today = utcDateStr(new Date())
    const tomorrow = utcDateStr(new Date(Date.now() + 86_400_000))

    const { data: bills, error } = await supabase
      .from('recurring_transactions')
      .select('id, wallet_id, next_run_date, template')
      .eq('is_active', true)
      .in('next_run_date', [today, tomorrow])

    if (error) throw error

    const results = await mapLimit(bills ?? [], 8, async (bill) => {
      try {
        return await remindForBill(supabase, bill as RecurringRow, today)
      } catch (err) {
        console.error(
          `Bill reminder failed for ${bill.id}:`,
          err instanceof Error ? err.message : String(err),
        )
        return { billId: bill.id, error: 'failed' }
      }
    })

    return jsonResponse({ processed: results.length, results })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function remindForBill(supabase: SupabaseClient, bill: RecurringRow, today: string) {
  const { data: members, error: membersError } = await supabase
    .from('wallet_members')
    .select('user_id')
    .eq('wallet_id', bill.wallet_id)
  if (membersError) throw membersError

  const memberIds = (members ?? []).map((m) => m.user_id)
  if (memberIds.length === 0) return { billId: bill.id, skipped: 'no members' }

  const label =
    bill.template?.merchant || bill.template?.description || 'Upcoming bill'
  const when = bill.next_run_date === today ? 'today' : 'tomorrow'
  const title = when === 'today' ? 'Bill due today' : 'Bill due tomorrow'
  const amountMinor = Number(bill.template?.amount_minor ?? 0)
  const currency = bill.template?.currency ?? ''
  const amountBit =
    amountMinor > 0 && currency
      ? ` (${formatMinor(amountMinor, currency)})`
      : amountMinor > 0
        ? ` (${(amountMinor / 100).toFixed(2)})`
        : ''
  const body = `${label}${amountBit} is due ${when}.`

  let notified = 0
  for (const userId of memberIds) {
    const result = await notifyUser(supabase, {
      userId,
      walletId: bill.wallet_id,
      kind: 'reminder',
      title,
      body,
      href: '/cashflow',
      dedupeKey: `bill:${bill.id}:${bill.next_run_date}`,
      payload: { recurring_id: bill.id, next_run_date: bill.next_run_date },
    })
    if (result.inserted || result.skippedReason === 'dedupe') notified++
  }

  return { billId: bill.id, notified }
}

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatMinor(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amountMinor / 100)
  } catch {
    return `${(amountMinor / 100).toFixed(0)} ${currency}`
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
