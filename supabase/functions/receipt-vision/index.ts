import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { GoogleGenAI } from 'npm:@google/genai@2.11.0'
import { corsHeadersFor } from '../_shared/cors.ts'
import { checkRateLimits } from '../_shared/rateLimit.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!

const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Vision is the most expensive per-call AI request in the app (image tokens),
// and this endpoint previously relied on the premium gate alone — the one AI
// endpoint with no per-user cap, so a single premium account (or a leaked
// premium token) could run up unbounded spend (audit finding).
const RECEIPT_RATE_LIMITS = {
  burst: { maxRequests: 10, windowMinutes: 5 },
  daily: { maxRequests: 100, windowMinutes: 60 * 24 },
}

interface RequestBody {
  walletId: string
  storagePath: string
}

interface Category {
  id: string
  name: string
}

interface CategorizationRule {
  match_type: 'merchant_contains' | 'description_contains'
  match_value: string
  category_id: string
}

interface Extraction {
  merchant: string | null
  transaction_date: string | null
  total_minor: number
  currency: string
  suggested_category: string | null
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    merchant: { type: 'string', description: 'The store or business name.' },
    transaction_date: { type: 'string', description: 'ISO 8601 date, YYYY-MM-DD.' },
    total_minor: { type: 'integer', description: 'The total amount paid, in integer minor units (cents).' },
    currency: { type: 'string', description: '3-letter currency code, e.g. USD.' },
    suggested_category: { type: 'string' },
  },
  required: ['total_minor', 'currency'],
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors })
  }
  const respond = (body: unknown, status = 200) => jsonResponse(body, cors, status)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return respond({ error: 'Missing Authorization header' }, 401)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return respond({ error: 'Invalid or expired session' }, 401)
    }

    const { data: isPremium, error: entitlementError } = await supabase.rpc('is_premium', {
      p_user_id: user.id,
    })
    if (entitlementError) throw entitlementError
    if (!isPremium) {
      return respond(
        { error: 'premium_required', message: 'Receipt scanning is a Penda Premium feature.' },
        402,
      )
    }

    // Cost guard on top of the premium gate — same pattern as chat/voice.
    const limitMessage = await checkRateLimits(supabase, user.id, 'receipt-vision', RECEIPT_RATE_LIMITS)
    if (limitMessage) {
      return respond({ error: limitMessage }, 429)
    }

    const body = (await req.json()) as RequestBody
    if (!body.walletId || !body.storagePath) {
      return respond({ error: 'walletId and storagePath are required' }, 400)
    }
    if (!UUID_RE.test(body.walletId)) {
      return respond({ error: 'walletId must be a UUID' }, 400)
    }

    // Independent reads — the image download and the three DB lookups all go
    // out at once (previously four sequential round-trips).
    const [download, categories, rules, walletRow] = await Promise.all([
      supabase.storage.from('receipts').download(body.storagePath),
      fetchCategories(supabase, body.walletId),
      fetchCategorizationRules(supabase, body.walletId),
      supabase.from('wallets').select('base_currency').eq('id', body.walletId).maybeSingle(),
    ])

    const { data: fileBlob, error: downloadError } = download
    if (downloadError || !fileBlob) {
      return respond({ error: `Could not read receipt image: ${downloadError?.message}` }, 400)
    }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer())
    const base64 = toBase64(bytes)
    const mimeType = fileBlob.type || 'image/jpeg'

    // The wallet is single-currency and the UI renders each transaction in its
    // own stored currency, so always store the wallet's currency — never the
    // symbol the model happened to read off the receipt.
    const currency = walletRow.data?.base_currency ?? 'USD'

    const extraction = await extractReceipt(base64, mimeType, categories)

    const merchant = extraction.merchant ?? null
    // Receipts have no free-text description field; description rules match
    // against merchant + suggested category so Teach-Penda rules still fire.
    const descriptionHaystack = [merchant, extraction.suggested_category].filter(Boolean).join(' ')
    let categoryId = categories.find((c) => c.name === extraction.suggested_category)?.id ?? null
    for (const rule of rules) {
      const haystack =
        (rule.match_type === 'merchant_contains' ? merchant : descriptionHaystack) ?? ''
      if (haystack.toLowerCase().includes(rule.match_value.toLowerCase())) {
        categoryId = rule.category_id
        break
      }
    }

    const transactionDate = isIsoDate(extraction.transaction_date) ? extraction.transaction_date : today()

    const { data: transaction, error: insertError } = await supabase
      .from('transactions')
      .insert({
        wallet_id: body.walletId,
        created_by: user.id,
        category_id: categoryId,
        amount_minor: Math.round(extraction.total_minor),
        currency,
        type: 'expense',
        merchant,
        transaction_date: transactionDate,
        source: 'receipt',
        receipt_storage_path: body.storagePath,
        ai_extraction: extraction,
        user_confirmed: false,
      })
      .select('*, category:categories(id, name)')
      .single()

    if (insertError) {
      // Log the detail, return a generic message — a Postgres error can echo
      // schema names or row values to the client.
      console.error('Failed to save draft transaction:', insertError.message)
      return respond({ error: 'Failed to save the draft transaction — please try again.' }, 500)
    }

    return respond({ transaction })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return respond({ error: 'Something went wrong on our side — please try again.' }, 500)
  }
})

async function extractReceipt(base64: string, mimeType: string, categories: Category[]): Promise<Extraction> {
  try {
    return await extractWithGemini(base64, mimeType, categories)
  } catch (error) {
    console.error('Gemini vision failed, falling back to Groq:', error)
    return await extractWithGroq(base64, mimeType, categories)
  }
}

async function extractWithGemini(base64: string, mimeType: string, categories: Category[]): Promise<Extraction> {
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  const categoryNames = categories.map((c) => c.name)

  const response = await genAI.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } },
          {
            text: `Extract the details from this receipt photo. suggested_category must be exactly one of: ${categoryNames.join(', ')}.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: EXTRACTION_SCHEMA,
    },
  })

  return JSON.parse(response.text ?? '{}')
}

async function extractWithGroq(base64: string, mimeType: string, categories: Category[]): Promise<Extraction> {
  const categoryNames = categories.map((c) => c.name)

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract the details from this receipt photo as a JSON object with exactly these keys: merchant (string), transaction_date (ISO 8601 YYYY-MM-DD), total_minor (integer, the total amount in cents), currency (3-letter code), suggested_category (must be exactly one of: ${categoryNames.join(', ')}). Respond with ONLY the JSON object.`,
            },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Groq error ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  return JSON.parse(data.choices[0].message.content ?? '{}')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function isIsoDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function jsonResponse(body: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function fetchCategories(supabase: SupabaseClient, walletId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .or(`wallet_id.eq.${walletId},wallet_id.is.null`)
  if (error) throw error
  return data ?? []
}

async function fetchCategorizationRules(supabase: SupabaseClient, walletId: string): Promise<CategorizationRule[]> {
  const { data, error } = await supabase
    .from('categorization_rules')
    .select('match_type, match_value, category_id')
    .eq('wallet_id', walletId)
  if (error) throw error
  return data ?? []
}
