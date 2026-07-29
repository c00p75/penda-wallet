import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeadersFor } from '../_shared/cors.ts'
import { escapeHtml } from '../_shared/html.ts'
import { notifyUser } from '../_shared/notify.ts'
import { checkRateLimits } from '../_shared/rateLimit.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Penda <invites@pendawallet.app>'
const APP_BASE_URL = Deno.env.get('APP_BASE_URL')

interface DeliverRequestBody {
  inviteId: string
}

interface WalletInviteRow {
  id: string
  wallet_id: string
  invited_email: string
  invited_user_id: string | null
  role: 'editor' | 'viewer'
  status: string
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  const respond = (body: unknown, status = 200) => jsonResponse(body, cors, status)

  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return respond({ error: 'Missing Authorization header' }, 401)

    // User-scoped client: RLS enforces the invitee/owner-only visibility on
    // wallet_invites/wallets, so most authorization here is "free" via RLS.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    // Service-role client only for the one thing RLS can't do for us:
    // inserting into `notifications` (no client insert policy on that table).
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token)
    if (userError || !user) return respond({ error: 'Invalid or expired session' }, 401)

    const body = (await req.json().catch(() => null)) as DeliverRequestBody | null
    if (!body?.inviteId) return respond({ error: 'inviteId is required' }, 400)

    const limitMessage = await checkRateLimits(serviceClient, user.id, 'wallet-invite-deliver', {
      burst: { maxRequests: 5, windowMinutes: 10 },
      daily: { maxRequests: 30, windowMinutes: 1440 },
    })
    if (limitMessage) return respond({ error: limitMessage }, 429)

    const { data: invite, error: inviteError } = await userClient
      .from('wallet_invites')
      .select('id, wallet_id, invited_email, invited_user_id, role, status')
      .eq('id', body.inviteId)
      .maybeSingle<WalletInviteRow>()
    if (inviteError) throw inviteError
    if (!invite) return respond({ error: 'Invite not found' }, 404)
    if (invite.status !== 'pending') {
      return respond({ error: 'This invite is no longer pending' }, 409)
    }

    // Belt-and-suspenders: the invitee can also SELECT their own invite row
    // (that's what powers their accept/decline view), so re-confirm the
    // caller is specifically the wallet OWNER before we send anything.
    const { data: isOwner, error: ownerError } = await userClient.rpc('is_wallet_member', {
      p_wallet_id: invite.wallet_id,
      p_min_role: 'owner',
    })
    if (ownerError) throw ownerError
    if (!isOwner) return respond({ error: 'Only the wallet owner can send invite emails' }, 403)

    const [{ data: wallet, error: walletError }, { data: inviterProfile, error: profileError }] =
      await Promise.all([
        userClient.from('wallets').select('name').eq('id', invite.wallet_id).single(),
        userClient.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
      ])
    if (walletError) throw walletError
    if (profileError) throw profileError

    const walletName = wallet?.name ?? 'a Penda money account'
    const inviterName = inviterProfile?.display_name || user.email || 'A Penda user'

    let inAppNotified = false
    if (invite.invited_user_id) {
      const result = await notifyUser(serviceClient, {
        userId: invite.invited_user_id,
        walletId: invite.wallet_id,
        kind: 'invite',
        title: `${inviterName} invited you to ${walletName}`,
        body: `Join as ${invite.role === 'editor' ? 'an editor' : 'a viewer'} to help manage money together.`,
        href: '/invites',
        dedupeKey: `wallet-invite:${invite.id}`,
      })
      inAppNotified = result.inserted || result.skippedReason === 'dedupe'
    }

    if (!RESEND_API_KEY) {
      return respond({
        invite,
        emailSent: false,
        inAppNotified,
        emailError: 'Email is not configured yet (missing RESEND_API_KEY).',
      })
    }
    if (!APP_BASE_URL) {
      return respond({
        invite,
        emailSent: false,
        inAppNotified,
        emailError: 'Email is not configured yet (missing APP_BASE_URL).',
      })
    }

    const acceptUrl = invite.invited_user_id
      ? `${APP_BASE_URL}/invites`
      : `${APP_BASE_URL}/login?mode=signup&email=${encodeURIComponent(invite.invited_email)}`

    const emailResult = await sendInviteEmail({
      to: invite.invited_email,
      walletName,
      inviterName,
      role: invite.role,
      acceptUrl,
      hasAccount: !!invite.invited_user_id,
    })

    if (emailResult.ok) {
      const { error: markError } = await userClient.rpc('mark_wallet_invite_delivered', {
        p_invite_id: invite.id,
      })
      if (markError) console.error('mark_wallet_invite_delivered failed:', markError.message)
    }

    return respond({
      invite,
      emailSent: emailResult.ok,
      inAppNotified,
      emailError: emailResult.ok ? undefined : emailResult.error,
    })
  } catch (error) {
    console.error(error)
    return respond({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

async function sendInviteEmail(opts: {
  to: string
  walletName: string
  inviterName: string
  role: 'editor' | 'viewer'
  acceptUrl: string
  hasAccount: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const roleLabel = opts.role === 'editor' ? 'an editor (can log and edit)' : 'a viewer (view only)'
  const subject = `${opts.inviterName} invited you to "${opts.walletName}" on Penda`
  const cta = opts.hasAccount ? 'View invite' : 'Create your account'
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <h2 style="margin:0 0 12px;">You're invited to ${escapeHtml(opts.walletName)}</h2>
      <p style="margin:0 0 16px;line-height:1.5;">
        ${escapeHtml(opts.inviterName)} invited you to join <strong>${escapeHtml(opts.walletName)}</strong> on Penda as ${roleLabel}.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${opts.acceptUrl}" style="display:inline-block;background:#5448cc;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600;">${cta}</a>
      </p>
      <p style="margin:0;font-size:13px;color:#666;">
        ${
          opts.hasAccount
            ? 'Log in to Penda and open Notifications to accept.'
            : `Sign up with ${escapeHtml(opts.to)} and you'll see this invite waiting for you.`
        }
      </p>
    </div>
  `
  const text = `${opts.inviterName} invited you to "${opts.walletName}" on Penda as ${roleLabel}.\n\n${cta}: ${opts.acceptUrl}`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to: [opts.to], subject, html, text }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    console.error('Resend send failed', res.status, errBody)
    return { ok: false, error: `Email provider returned ${res.status}` }
  }
  return { ok: true }
}

function jsonResponse(body: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
