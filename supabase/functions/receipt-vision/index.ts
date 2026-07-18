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

interface ExtractionItem {
  description: string
  quantity: number
  /** Line total in minor units (cents), not unit price. */
  amount_minor: number
  /** Best-fit category name for this line alone. */
  suggested_category: string | null
}

interface Extraction {
  merchant: string | null
  transaction_date: string | null
  total_minor: number
  currency: string
  suggested_category: string | null
  items: ExtractionItem[]
}

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    merchant: { type: 'string', description: 'The store or business name.' },
    transaction_date: { type: 'string', description: 'ISO 8601 date, YYYY-MM-DD.' },
    total_minor: { type: 'integer', description: 'The total amount paid, in integer minor units (cents).' },
    currency: { type: 'string', description: '3-letter currency code, e.g. USD.' },
    suggested_category: { type: 'string' },
    items: {
      type: 'array',
      description:
        'Each purchased line item. Exclude TOTAL, TAX, CASH, CHANGE, subtotal, and payment rows.',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Item name as printed on the receipt.' },
          quantity: { type: 'number', description: 'Quantity purchased; default 1.' },
          amount_minor: {
            type: 'integer',
            description: 'Line total in cents (quantity × unit price when both are shown).',
          },
          suggested_category: {
            type: 'string',
            description: 'Best category for this line alone; may differ across items.',
          },
        },
        required: ['description', 'amount_minor'],
      },
    },
  },
  required: ['total_minor', 'currency', 'items'],
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

    // Premium: unlimited. Free: one claim via claim_receipt_scan_preview (sets
    // entitlements.receipt_scan_preview_used). Claim runs before vision so a
    // failed AI call still consumes the free preview.
    const { data: canScan, error: entitlementError } = await supabase.rpc(
      'claim_receipt_scan_preview',
      { p_user_id: user.id },
    )
    if (entitlementError) throw entitlementError
    if (!canScan) {
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
            text: `Extract the details from this receipt photo. Include every purchased line in items (description, quantity, amount_minor as the line total in cents, suggested_category for that line alone). Do not put TOTAL/CASH/CHANGE/TAX in items. Top-level suggested_category and each item's suggested_category must each be exactly one of: ${categoryNames.join(', ')}.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: EXTRACTION_SCHEMA,
    },
  })

  return normalizeExtraction(JSON.parse(response.text ?? '{}'), categoryNames)
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
              text: `Extract the details from this receipt photo as a JSON object with keys: merchant (string), transaction_date (ISO 8601 YYYY-MM-DD), total_minor (integer, total paid in cents), currency (3-letter code), suggested_category (overall; must be exactly one of: ${categoryNames.join(', ')}), items (array of { description, quantity, amount_minor, suggested_category } for each purchased line — amount_minor is the line total in cents; each item's suggested_category may differ and must be one of the same list; exclude TOTAL/CASH/CHANGE/TAX). Respond with ONLY the JSON object.`,
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
  return normalizeExtraction(JSON.parse(data.choices[0].message.content ?? '{}'), categoryNames)
}

function normalizeCategoryName(value: unknown, allowed: string[]): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const exact = allowed.find((name) => name === trimmed)
  if (exact) return exact
  const lower = trimmed.toLowerCase()
  return allowed.find((name) => name.toLowerCase() === lower) ?? null
}

function normalizeExtraction(raw: Partial<Extraction>, categoryNames: string[]): Extraction {
  const topCategory = normalizeCategoryName(raw.suggested_category, categoryNames)
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item) => ({
          description: String(item?.description ?? '').trim(),
          quantity: Number(item?.quantity) > 0 ? Number(item.quantity) : 1,
          amount_minor: Math.round(Number(item?.amount_minor) || 0),
          suggested_category:
            normalizeCategoryName(item?.suggested_category, categoryNames) ?? topCategory,
        }))
        .filter((item) => item.description && item.amount_minor > 0)
    : []

  return {
    merchant: raw.merchant ?? null,
    transaction_date: raw.transaction_date ?? null,
    total_minor: Math.round(Number(raw.total_minor) || 0),
    currency: raw.currency ?? 'USD',
    suggested_category: topCategory,
    items,
  }
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
