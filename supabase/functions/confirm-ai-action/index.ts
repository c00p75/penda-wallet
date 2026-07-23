import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeadersFor } from '../_shared/cors.ts'
import {
  loadConsentAndTrust,
  persistTrustAfterConfirm,
} from '../_shared/aiTrust.ts'
import {
  executePendingAction,
  type PendingActionRow,
} from '../_shared/executePendingAction.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

interface ConfirmRequestBody {
  actionId: string
  decision: 'confirm' | 'cancel'
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

    const { data: action, error: loadError } = await supabase
      .from('ai_pending_actions')
      .select('id, kind, domain, target_id, wallet_id, user_id, patch, summary, status')
      .eq('id', body.actionId)
      .maybeSingle()

    if (loadError) throw loadError
    if (!action) return respond({ error: 'That action no longer exists.' }, 404)

    const pending = action as PendingActionRow
    if (pending.status !== 'pending') {
      return respond({
        ok: pending.status === 'confirmed' || pending.status === 'auto_applied',
        status: pending.status,
        domain: pending.domain,
        summary: pending.summary,
      })
    }

    const newStatus = body.decision === 'cancel' ? 'cancelled' : 'confirmed'
    const claimed = await claim(supabase, pending.id, newStatus)
    if (!claimed) {
      // Lost race with another tab/flush: return the winner's terminal status
      // so offline queues can drop the item instead of retrying forever.
      const { data: latest } = await supabase
        .from('ai_pending_actions')
        .select('status, domain, summary, target_id, kind')
        .eq('id', pending.id)
        .maybeSingle()
      if (!latest) return respond({ error: 'That action no longer exists.' }, 404)
      return respond({
        ok: latest.status === 'confirmed' || latest.status === 'auto_applied',
        status: latest.status,
        domain: latest.domain,
        summary: latest.summary,
        targetId: latest.target_id,
        kind: latest.kind,
      })
    }

    if (body.decision === 'cancel') {
      return respond({
        ok: false,
        status: 'cancelled',
        domain: pending.domain,
        summary: pending.summary,
        targetId: pending.target_id,
      })
    }

    let targetId = pending.target_id
    try {
      const execResult = await executePendingAction(supabase, pending)
      if (execResult?.targetId) targetId = execResult.targetId
    } catch (error) {
      await supabase
        .from('ai_pending_actions')
        .update({ status: 'pending', resolved_at: null })
        .eq('id', pending.id)
      throw error
    }

    const { consent, trust } = await loadConsentAndTrust(supabase, user.id)
    await persistTrustAfterConfirm(supabase, user.id, consent, trust)

    return respond({
      ok: true,
      status: 'confirmed',
      domain: pending.domain,
      summary: pending.summary,
      targetId,
      kind: pending.kind,
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return respond({ error: "Couldn't apply that change, please try again." }, 500)
  }
})

async function claim(
  supabase: SupabaseClient,
  id: string,
  status: 'confirmed' | 'cancelled',
): Promise<boolean> {
  const { data, error } = await supabase
    .from('ai_pending_actions')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}

function jsonResponse(body: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
