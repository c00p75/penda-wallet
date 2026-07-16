import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeadersFor } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

// This is the ONLY place a chat-agent update or delete actually touches the
// ledger. The chat-message function can only *stage* those into
// ai_pending_actions; nothing there mutates a record. Execution happens here,
// and only in response to an explicit user tap on the confirmation card — the
// hard tool-layer guardrail promised by roadmap bet #4.

// domain -> {table, softDelete, deletable, columns}. Kept in sync with
// CRUD_DOMAINS in chat-message. Audit finding: chat-message validates the
// field allowlist when it STAGES a patch, but this executor previously
// applied whatever `patch` sat in the row verbatim. Since a user can insert
// their own row into ai_pending_actions (RLS only checks user_id + editor
// membership), that let an authenticated user bypass the app's own
// guardrails on their own data (e.g. patch a column never exposed as
// editable, or force-delete a wallet). Re-asserting the same allowlist here
// is defense-in-depth: the guardrail now holds even if staging is bypassed.
const DOMAIN_TABLES: Record<string, { table: string; softDelete: boolean; deletable: boolean; columns: string[] }> = {
  transaction: {
    table: 'transactions',
    softDelete: true,
    deletable: true,
    columns: ['amount_minor', 'type', 'category_id', 'merchant', 'description', 'transaction_date'],
  },
  debt: {
    table: 'debts',
    softDelete: false,
    deletable: true,
    columns: ['name', 'direction', 'counterparty', 'principal_minor', 'due_date'],
  },
  budget: {
    table: 'budgets',
    softDelete: false,
    deletable: true,
    columns: ['amount_minor', 'period', 'category_id', 'rollover'],
  },
  goal: {
    table: 'savings_goals',
    softDelete: false,
    deletable: true,
    columns: ['name', 'target_amount_minor', 'current_amount_minor', 'target_date'],
  },
  category: { table: 'categories', softDelete: false, deletable: true, columns: ['name', 'icon'] },
  wallet: { table: 'wallets', softDelete: false, deletable: false, columns: ['name'] },
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
  const cors = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors })
  }
  const respond = (body: unknown, status = 200) => jsonResponse(body, cors, status)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return respond({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)
    if (userError || !user) return respond({ error: 'Invalid or expired session' }, 401)

    const body = (await req.json()) as ConfirmRequestBody
    if (!body.actionId || (body.decision !== 'confirm' && body.decision !== 'cancel')) {
      return respond({ error: 'actionId and decision ("confirm" | "cancel") are required' }, 400)
    }

    // RLS scopes this to the caller's own actions.
    const { data: action, error: loadError } = await supabase
      .from('ai_pending_actions')
      .select('id, kind, domain, target_id, patch, summary, status')
      .eq('id', body.actionId)
      .maybeSingle()

    if (loadError) throw loadError
    if (!action) return respond({ error: 'That action no longer exists.' }, 404)

    const pending = action as PendingAction
    if (pending.status !== 'pending') {
      // Already resolved — report the terminal state rather than re-applying.
      return respond({ ok: pending.status === 'confirmed', status: pending.status, domain: pending.domain, summary: pending.summary })
    }

    const newStatus = body.decision === 'cancel' ? 'cancelled' : 'confirmed'
    // Claim the row before doing anything else: an atomic compare-and-swap
    // (update only WHERE status is still 'pending') closes the race where two
    // concurrent taps both read 'pending' and both would otherwise execute —
    // the unconditional update this replaced had no such guard.
    const claimed = await claim(supabase, pending.id, newStatus)
    if (!claimed) {
      return respond({ error: 'That action was already resolved — please refresh.' }, 409)
    }

    if (body.decision === 'cancel') {
      return respond({ ok: false, status: 'cancelled', domain: pending.domain, summary: pending.summary })
    }

    try {
      await execute(supabase, pending)
    } catch (error) {
      // The claim already flipped status to 'confirmed'; if execution then
      // fails, revert to 'pending' so the user can retry rather than being
      // left with a claimed-but-never-applied action.
      await supabase.from('ai_pending_actions').update({ status: 'pending', resolved_at: null }).eq('id', pending.id)
      throw error
    }
    return respond({ ok: true, status: 'confirmed', domain: pending.domain, summary: pending.summary })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return respond({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

/** Atomic compare-and-swap: only succeeds if the row was still 'pending'. */
async function claim(supabase: SupabaseClient, id: string, status: 'confirmed' | 'cancelled'): Promise<boolean> {
  const { data, error } = await supabase
    .from('ai_pending_actions')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}

async function execute(supabase: SupabaseClient, action: PendingAction) {
  const target = DOMAIN_TABLES[action.domain]
  if (!target) throw new Error(`Unknown domain "${action.domain}".`)

  if (action.kind === 'update') {
    const patch = action.patch ?? {}
    // Re-assert the allowlist even though chat-message already validated it
    // at staging time — this executor must not trust that patches always
    // came from there (see the comment on DOMAIN_TABLES above).
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([column]) => target.columns.includes(column)),
    )
    if (Object.keys(safePatch).length === 0) throw new Error('Nothing to update.')
    const { error } = await supabase.from(target.table).update(safePatch).eq('id', action.target_id)
    if (error) throw error
    return
  }

  // delete
  if (!target.deletable) throw new Error(`Deleting a ${action.domain} isn't allowed.`)
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

function jsonResponse(body: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
