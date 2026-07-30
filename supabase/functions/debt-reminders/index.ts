import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'
import { notifyUser } from '../_shared/notify.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { mapLimit } from '../_shared/concurrency.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

interface DebtRow {
  id: string
  wallet_id: string
  name: string
  direction: 'i_owe' | 'owed_to_me'
  counterparty: string | null
  balance_minor: number
  due_date: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  if (req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const today = utcDateStr(new Date())
    const tomorrow = utcDateStr(new Date(Date.now() + 86_400_000))

    // Open debts due today or tomorrow, plus still-open overdue debts (remind once
    // per calendar day while they stay past due).
    const { data: debts, error } = await supabase
      .from('debts')
      .select('id, wallet_id, name, direction, counterparty, balance_minor, due_date')
      .is('archived_at', null)
      .gt('balance_minor', 0)
      .not('due_date', 'is', null)
      .lte('due_date', tomorrow)

    if (error) throw error

    const due = (debts ?? []).filter((d) => {
      const row = d as DebtRow
      return row.due_date === today || row.due_date === tomorrow || row.due_date < today
    })

    const results = await mapLimit(due, 8, async (raw) => {
      const debt = raw as DebtRow
      try {
        return await remindForDebt(supabase, debt, today)
      } catch (err) {
        console.error(
          `Debt reminder failed for ${debt.id}:`,
          err instanceof Error ? err.message : String(err),
        )
        return { debtId: debt.id, error: 'failed' }
      }
    })

    return jsonResponse({ processed: results.length, results })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function remindForDebt(supabase: SupabaseClient<Database>, debt: DebtRow, today: string) {
  const { data: members, error: membersError } = await supabase
    .from('wallet_members')
    .select('user_id')
    .eq('wallet_id', debt.wallet_id)
  if (membersError) throw membersError

  const memberIds = (members ?? []).map((m) => m.user_id)
  if (memberIds.length === 0) return { debtId: debt.id, skipped: 'no members' }

  const overdue = debt.due_date < today
  const when = overdue ? 'overdue' : debt.due_date === today ? 'today' : 'tomorrow'
  const iOwe = debt.direction === 'i_owe'
  const who = debt.counterparty?.trim()
  const label = debt.name || (iOwe ? 'A debt you owe' : 'Money owed to you')

  const title =
    when === 'overdue'
      ? iOwe
        ? 'Debt overdue'
        : 'Repayment overdue'
      : when === 'today'
        ? iOwe
          ? 'Debt due today'
          : 'Repayment due today'
        : iOwe
          ? 'Debt due tomorrow'
          : 'Repayment due tomorrow'

  const amountBit = debt.balance_minor > 0 ? ` (${formatMinor(debt.balance_minor)})` : ''
  const withWhom = who ? (iOwe ? ` to ${who}` : ` from ${who}`) : ''
  const body =
    when === 'overdue'
      ? `${label}${withWhom}${amountBit} was due ${debt.due_date}.`
      : `${label}${withWhom}${amountBit} is due ${when}.`

  // Overdue reminders re-fire daily; today/tomorrow are one-shot per due date.
  const dedupeKey =
    when === 'overdue' ? `debt:${debt.id}:overdue:${today}` : `debt:${debt.id}:${debt.due_date}`

  let notified = 0
  for (const userId of memberIds) {
    const result = await notifyUser(supabase, {
      userId,
      walletId: debt.wallet_id,
      kind: 'reminder',
      title,
      body,
      href: `/goals?debt=${debt.id}`,
      dedupeKey,
      payload: { debt_id: debt.id, due_date: debt.due_date, when },
    })
    if (result.inserted || result.skippedReason === 'dedupe') notified++
  }

  return { debtId: debt.id, notified, when }
}

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatMinor(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
