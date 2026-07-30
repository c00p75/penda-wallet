import { createClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { hardDeleteAccount } from '../_shared/hardDeleteAccount.ts'
import { mapLimit } from '../_shared/concurrency.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

// Daily sweep: accounts past their grace period (see delete-account) get the
// same wipe confirm-account-deletion would run on demand. One failure doesn't
// block the rest of the batch — it's picked up again on the next run.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  if (req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
    return json({ error: 'Forbidden' }, 403)
  }

  const admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: expired, error } = await admin
    .from('profiles')
    .select('id')
    .not('scheduled_deletion_at', 'is', null)
    .lte('scheduled_deletion_at', new Date().toISOString())
  if (error) return json({ error: error.message }, 500)

  let purged = 0
  let failed = 0
  await mapLimit(expired ?? [], 5, async ({ id }) => {
    try {
      await hardDeleteAccount(admin, id)
      purged++
    } catch (error) {
      failed++
      console.error('purge-deleted-accounts failed for', id, error)
    }
  })

  return json({ ok: true, purged, failed })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
