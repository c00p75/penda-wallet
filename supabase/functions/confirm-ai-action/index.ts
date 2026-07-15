import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

// This is the ONLY place a chat-agent update or delete actually touches the
// ledger. The chat-message function can only *stage* those into
// ai_pending_actions; nothing there mutates a record. Execution happens here,
// and only in response to an explicit user tap on the confirmation card — the
// hard tool-layer guardrail promised by roadmap bet #4.

// domain -> {table, softDelete}. Kept minimal and in sync with CRUD_DOMAINS in
// chat-message; only these tables can be reached, and only by id.
const DOMAIN_TABLES: Record<string, { table: string; softDelete: boolean }> = {
  transaction: { table: 'transactions', softDelete: true },
  debt: { table: 'debts', softDelete: false },
  budget: { table: 'budgets', softDelete: false },
  goal: { table: 'savings_goals', softDelete: false },
  category: { table: 'categories', softDelete: false },
  wallet: { table: 'wallets', softDelete: false },
}

interface ConfirmRequestBody {
  actionId: string
  decision: 'confirm' | 'cancel'
}

interface PendingAction {
  id: string
  kind: 'update' | 'delete'
  domain: string
  target_id: string
  patch: Record<string, unknown> | null
  summary: string
  status: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)
    if (userError || !user) return jsonResponse({ error: 'Invalid or expired session' }, 401)

    const body = (await req.json()) as ConfirmRequestBody
    if (!body.actionId || (body.decision !== 'confirm' && body.decision !== 'cancel')) {
      return jsonResponse({ error: 'actionId and decision ("confirm" | "cancel") are required' }, 400)
    }

    // RLS scopes this to the caller's own actions; we still verify status here
    // so a double-tap or replayed request can't apply the change twice.
    const { data: action, error: loadError } = await supabase
      .from('ai_pending_actions')
      .select('id, kind, domain, target_id, patch, summary, status')
      .eq('id', body.actionId)
      .maybeSingle()

    if (loadError) throw loadError
    if (!action) return jsonResponse({ error: 'That action no longer exists.' }, 404)

    const pending = action as PendingAction
    if (pending.status !== 'pending') {
      // Already resolved — report the terminal state rather than re-applying.
      return jsonResponse({ ok: pending.status === 'confirmed', status: pending.status, domain: pending.domain, summary: pending.summary })
    }

    if (body.decision === 'cancel') {
      await resolve(supabase, pending.id, 'cancelled')
      return jsonResponse({ ok: false, status: 'cancelled', domain: pending.domain, summary: pending.summary })
    }

    await execute(supabase, pending)
    await resolve(supabase, pending.id, 'confirmed')
    return jsonResponse({ ok: true, status: 'confirmed', domain: pending.domain, summary: pending.summary })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function execute(supabase: SupabaseClient, action: PendingAction) {
  const target = DOMAIN_TABLES[action.domain]
  if (!target) throw new Error(`Unknown domain "${action.domain}".`)

  if (action.kind === 'update') {
    const patch = action.patch ?? {}
    if (Object.keys(patch).length === 0) throw new Error('Nothing to update.')
    const { error } = await supabase.from(target.table).update(patch).eq('id', action.target_id)
    if (error) throw error
    return
  }

  // delete
  if (target.softDelete) {
    const { error } = await supabase
      .from(target.table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', action.target_id)
    if (error) throw error
  } else {
    const { error } = await supabase.from(target.table).delete().eq('id', action.target_id)
    if (error) throw error
  }
}

async function resolve(supabase: SupabaseClient, id: string, status: 'confirmed' | 'cancelled') {
  await supabase
    .from('ai_pending_actions')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
