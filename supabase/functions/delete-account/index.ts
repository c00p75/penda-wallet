import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Self-serve account + data deletion (compliance). The caller authenticates
// with their own JWT (anon client); a service-role client then performs the
// wipe, since several created_by FKs would otherwise block the auth-user
// delete and Storage/auth aren't reachable under the caller's RLS.
//
// Shared-wallet policy: deleting your account never destroys resources others
// still share. A wallet with no other members is deleted (cascading its data);
// a wallet with any other member survives, your membership is removed and
// authorship (created_by) is handed to a surviving member (an existing owner
// if there is one, otherwise the most-tenured member is promoted to owner) so
// co-members keep everything, even if you were the only owner.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const token = authHeader.replace('Bearer ', '')
  const {
    data: { user },
  } = await authed.auth.getUser(token)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const userId = user.id
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    await handleWallets(admin, userId)

    // Contributions in surviving (shared) wallets: drop authorship, keep the
    // record for the goal. created_by is nullable here, so null is safe.
    await admin.from('savings_contributions').update({ created_by: null }).eq('created_by', userId)

    // Challenges I created aren't wallet-scoped; remove them (cascades participants).
    await admin.from('budget_challenges').delete().eq('creator_id', userId)

    await deleteReceipts(admin, userId)

    // Cascades profiles → chat, ai_*, notifications, push_subscriptions,
    // entitlements, challenge_participants, and any remaining wallet_members rows.
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) throw error

    return json({ ok: true })
  } catch (error) {
    console.error('delete-account failed for', userId, error)
    return json({ error: error instanceof Error ? error.message : 'Deletion failed' }, 500)
  }
})

// Every wallet-scoped table with a created_by FK to profiles that would
// otherwise block the auth-user delete. Kept in sync with `grep 'references
// profiles'` across migrations, miss one and deleteUser fails on its FK.
const AUTHORED_WALLET_TABLES = [
  'transactions',
  'recurring_transactions',
  'spending_plans',
  'commitment_pacts',
]

async function handleWallets(admin: SupabaseClient, userId: string) {
  const { data: memberships } = await admin
    .from('wallet_members')
    .select('wallet_id')
    .eq('user_id', userId)

  for (const { wallet_id: walletId } of memberships ?? []) {
    // Every other member, owners first, then most-tenured, the heir order.
    const { data: others } = await admin
      .from('wallet_members')
      .select('user_id, role, joined_at')
      .eq('wallet_id', walletId)
      .neq('user_id', userId)
      .order('joined_at', { ascending: true })

    if (!others || others.length === 0) {
      // Last member, delete the wallet, cascading all its data.
      await admin.from('wallets').delete().eq('id', walletId)
      continue
    }

    // Wallet survives. Prefer an existing owner; otherwise promote the
    // most-tenured member so the wallet is never left ownerless.
    const heirRow = others.find((m) => m.role === 'owner') ?? others[0]
    const heir = heirRow.user_id
    if (heirRow.role !== 'owner') {
      await admin
        .from('wallet_members')
        .update({ role: 'owner' })
        .eq('wallet_id', walletId)
        .eq('user_id', heir)
    }

    // Hand off authorship of everything the departing user created here, then leave.
    await admin.from('wallets').update({ created_by: heir }).eq('id', walletId).eq('created_by', userId)
    for (const table of AUTHORED_WALLET_TABLES) {
      await admin.from(table).update({ created_by: heir }).eq('wallet_id', walletId).eq('created_by', userId)
    }
    await admin.from('wallet_members').delete().eq('wallet_id', walletId).eq('user_id', userId)
  }
}

async function deleteReceipts(admin: SupabaseClient, userId: string) {
  // All of a user's receipt files live under the single {userId}/ prefix.
  // Page through until the prefix is empty (list caps at 100 per call); the
  // bounded loop is a guard against an unexpected non-empty list.
  const PAGE = 100
  for (let i = 0; i < 200; i++) {
    const { data: files } = await admin.storage.from('receipts').list(userId, { limit: PAGE })
    if (!files || files.length === 0) break
    await admin.storage.from('receipts').remove(files.map((f) => `${userId}/${f.name}`))
    if (files.length < PAGE) break
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
