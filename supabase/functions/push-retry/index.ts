import { createClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'
import { processPushOutbox } from '../_shared/pushDeliver.ts'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  if (req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders })
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const result = await processPushOutbox(supabase, 75)
    return Response.json(result, { headers: corsHeaders })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: corsHeaders },
    )
  }
})
