import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

// open.er-api.com — free, no key, includes GHS/NGN/KES/ZAR (Frankfurter/ECB lacks these).
const RATES_URL = 'https://open.er-api.com/v6/latest/USD'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const cronHeader = req.headers.get('X-Cron-Secret')
  const auth = req.headers.get('Authorization')
  const ok =
    (CRON_SECRET && cronHeader === CRON_SECRET) ||
    (SUPABASE_SERVICE_ROLE_KEY && auth === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`)
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const res = await fetch(RATES_URL)
    if (!res.ok) throw new Error(`Rates fetch failed: ${res.status}`)
    const body = (await res.json()) as {
      result?: string
      rates?: Record<string, number>
    }
    if (body.result !== 'success' || !body.rates) {
      throw new Error('Unexpected rates payload')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const fetchedAt = new Date().toISOString()
    const rows = Object.entries(body.rates).map(([quote, rate]) => ({
      base_currency: 'USD',
      quote_currency: quote,
      rate,
      fetched_at: fetchedAt,
    }))
    rows.push({ base_currency: 'USD', quote_currency: 'USD', rate: 1, fetched_at: fetchedAt })

    // Upsert in chunks
    const chunk = 100
    let upserted = 0
    for (let i = 0; i < rows.length; i += chunk) {
      const { error } = await supabase.from('exchange_rates').upsert(rows.slice(i, i + chunk))
      if (error) throw error
      upserted += Math.min(chunk, rows.length - i)
    }

    return new Response(JSON.stringify({ ok: true, upserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return new Response(JSON.stringify({ error: 'Failed to refresh rates' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
