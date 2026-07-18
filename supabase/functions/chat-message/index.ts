import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { GoogleGenAI, type Content, type Part } from 'npm:@google/genai@2.11.0'
import { corsHeadersFor } from '../_shared/cors.ts'
import { checkRateLimits } from '../_shared/rateLimit.ts'
import {
  GENDER_LABELS,
  GOAL_LABELS,
  INCOME_RANGE_LABELS,
  MODE_AI_CONTEXT,
  PERSONALITY_NAMES,
  PERSONALITY_PROMPTS,
} from '../_shared/personas.ts'
import {
  loadConsentAndTrust,
  mayActWithoutConfirm,
  normalizeAiConsent,
  normalizeAiTrust,
  persistTrustAfterConfirm,
  type AiConsent,
  type AiTrust,
} from '../_shared/aiTrust.ts'
import { executePendingAction } from '../_shared/executePendingAction.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!

const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const MAX_TOOL_ITERATIONS = 4
const MAX_OUTPUT_TOKENS = 1024
const MODEL_TIMEOUT_MS = 12_000
// Wall-clock ceiling for the whole agentic turn. Without it the worst case
// stacked to ~160s (timeout × two providers × four iterations) before the
// user saw anything; past this budget we stop iterating and return the
// fallback reply instead of starting another model call.
const TURN_BUDGET_MS = 40_000

// Bounds cost/abuse from any single account: a tight burst window (keeps a
// runaway client/loop from hammering the model) plus a loose daily cap.
const CHAT_RATE_LIMITS = {
  burst: { maxRequests: 20, windowMinutes: 5 },
  daily: { maxRequests: 200, windowMinutes: 60 * 24 },
}

// Symbols for the currencies the app offers (mirrors apps/web/src/lib/currencies.ts).
// Used only to help the model speak money in the wallet's currency; falls back to the code.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹', CAD: '$', AUD: '$',
  CHF: 'CHF', ZAR: 'R', NGN: '₦', KES: 'KSh', GHS: 'GH₵', ZMW: 'K', EGP: 'E£',
  MAD: 'MAD', BRL: 'R$', MXN: '$', ARS: '$', SGD: '$', HKD: '$', AED: 'AED',
  SAR: 'SAR', ILS: '₪', TRY: '₺', RUB: '₽', KRW: '₩', IDR: 'Rp', MYR: 'RM',
  THB: '฿', PHP: '₱', VND: '₫', PLN: 'zł', SEK: 'kr', NOK: 'kr', DKK: 'kr', NZD: '$',
}

interface PageContext {
  page: string
  entityId?: string
}

const ALLOWED_CHAT_PAGES = new Set([
  'home',
  'ledger',
  'budgets',
  'goals',
  'goal-detail',
  'cashflow',
  'challenges',
  'analytics',
  'journal',
  'simulator',
  'settings',
  'profile',
  'business',
  'missions',
  'activity',
  'notifications',
  'ai-actions',
  'family',
  'settle-up',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sanitizePageContext(raw: unknown): PageContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const page = (raw as { page?: unknown }).page
  const entityId = (raw as { entityId?: unknown }).entityId
  if (typeof page !== 'string' || !ALLOWED_CHAT_PAGES.has(page)) return undefined
  if (entityId != null && (typeof entityId !== 'string' || !UUID_RE.test(entityId))) return undefined
  return typeof entityId === 'string' ? { page, entityId } : { page }
}

interface ChatRequestBody {
  walletId: string
  conversationId?: string
  message: string
  pageContext?: PageContext
  /** When true (or Accept: text/event-stream), reply as SSE token stream. */
  stream?: boolean
}

interface ChatTurnResult {
  conversationId: string
  reply: string
  transaction: Record<string, unknown> | null
  pendingActions: PendingAction[]
  actions: CompletedAction[]
  autoApplied?: boolean
}

interface StreamHooks {
  onToken?: (text: string) => void
  /** Clear partial streamed text when a turn pivots into tool calls. */
  onReset?: () => void
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

// Provider-agnostic message shape — persisted to the DB and adapted to each
// provider's wire format at call time, so either provider can pick up a
// conversation on any turn (this is what makes the Groq fallback possible).
type NeutralPart =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; result: string }

interface NeutralMessage {
  role: 'user' | 'assistant'
  parts: NeutralPart[]
}

interface ToolDefinition {
  name: string
  description: string
  parametersJsonSchema: Record<string, unknown>
}

interface ModelTurn {
  text: string
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>
}

// A staged update/delete surfaced to the client as a Yes/Cancel card. The tool
// layer NEVER executes these — confirm-ai-action does, on an explicit user tap.
interface PendingAction {
  id: string
  kind: 'update' | 'delete'
  domain: string
  summary: string
  targetId: string
}

// Durable tool step for the chat action trail (creates, lookups, memories).
// Staged update/delete stay on PendingAction cards instead.
interface CompletedAction {
  id: string
  tool: string
  domain: string
  label: string
  summary: string
  status: 'done' | 'error'
  targetId?: string
  details?: Record<string, string>
}

// Everything a tool handler needs, so handlers take one ctx instead of a long
// argument list. pendingActions is mutated in place by the staging handlers.
interface ToolContext {
  supabase: SupabaseClient
  walletId: string
  userId: string
  conversationId: string
  currency: string
  symbol: string
  categories: Category[]
  rules: CategorizationRule[]
  createdTransaction: Record<string, unknown> | null
  pendingActions: PendingAction[]
  completedActions: CompletedAction[]
  /** Latest create ids by domain for action-trail deep-links. */
  createdIds: Partial<Record<string, string>>
  autoApplied: boolean
  /** Cached when checking auto-apply; avoids a second profile read. */
  _consent?: AiConsent
  _trust?: AiTrust
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

    // Cost/abuse guard (audit finding): bound how often any one account can
    // hit the model before doing any LLM work. Fails open on a DB hiccup —
    // see checkRateLimits — so a broken limiter never takes down chat itself.
    const limitMessage = await checkRateLimits(supabase, user.id, 'chat-message', CHAT_RATE_LIMITS)
    if (limitMessage) {
      return respond({ error: limitMessage }, 429)
    }

    const body = (await req.json()) as ChatRequestBody
    if (!body.walletId || !body.message) {
      return respond({ error: 'walletId and message are required' }, 400)
    }
    // walletId is interpolated into PostgREST .or() filters (categories,
    // query_records) — RLS bounds the blast radius, but reject non-UUIDs at
    // the door like sanitizePageContext already does for entityId.
    if (!UUID_RE.test(body.walletId)) {
      return respond({ error: 'walletId must be a UUID' }, 400)
    }
    if (body.conversationId != null && !UUID_RE.test(body.conversationId)) {
      return respond({ error: 'conversationId must be a UUID' }, 400)
    }

    const conversationId = await getOrCreateConversation(supabase, user.id, body.walletId, body.conversationId)
    // History needs the conversation id; the rest are independent reads — fan out.
    const [history, categories, rules, profile, memories, currency] = await Promise.all([
      fetchHistory(supabase, conversationId),
      fetchCategories(supabase, body.walletId),
      fetchCategorizationRules(supabase, body.walletId),
      fetchProfile(supabase, user.id),
      fetchMemories(supabase, user.id),
      fetchWalletCurrency(supabase, body.walletId),
    ])

    const tools = buildTools(categories)
    const pageContext = sanitizePageContext(body.pageContext)
    const systemInstruction = buildSystemInstruction(profile, currency, memories, pageContext)

    const userMessage: NeutralMessage = { role: 'user', parts: [{ type: 'text', text: body.message }] }
    await insertMessage(supabase, conversationId, userMessage)

    const neutralHistory: NeutralMessage[] = [...history, userMessage]
    const ctx: ToolContext = {
      supabase,
      walletId: body.walletId,
      userId: user.id,
      conversationId,
      currency,
      symbol: CURRENCY_SYMBOLS[currency] ?? currency,
      categories,
      rules,
      createdTransaction: null,
      pendingActions: [],
      completedActions: [],
      createdIds: {},
      autoApplied: false,
    }

    // Progress channel for the chat UI — subscribed lazily on the FIRST tool
    // broadcast, so a pure Q&A turn (no tools) never pays the subscribe
    // handshake (up to 1500ms) it previously paid on every request.
    const progressChannel = supabase.channel(`chat:${conversationId}`)
    let progressReady: Promise<void> | null = null
    const ensureProgressChannel = () => {
      progressReady ??= new Promise<void>((resolve) => {
        const t = setTimeout(() => resolve(), 1500)
        progressChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(t)
            resolve()
          }
        })
      })
      return progressReady
    }

    const wantsStream =
      body.stream === true || (req.headers.get('Accept') ?? '').includes('text/event-stream')

    const runAgent = async (hooks?: StreamHooks): Promise<ChatTurnResult> => {
      const turnStart = Date.now()
      try {
        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          // Out of wall-clock budget — stop starting new model calls and fall
          // through to the "try rephrasing" reply rather than risk a gateway
          // timeout with nothing persisted for the client to show.
          if (iteration > 0 && Date.now() - turnStart > TURN_BUDGET_MS) break

          const turn = await callModel(neutralHistory, systemInstruction, tools, hooks?.onToken)

          const assistantParts: NeutralPart[] = []
          if (turn.text) assistantParts.push({ type: 'text', text: turn.text })
          for (const call of turn.toolCalls) {
            assistantParts.push({ type: 'tool_call', id: call.id, name: call.name, args: call.args })
          }
          const assistantMessage: NeutralMessage = { role: 'assistant', parts: assistantParts }
          await insertMessage(supabase, conversationId, assistantMessage)
          neutralHistory.push(assistantMessage)

          if (turn.toolCalls.length === 0) {
            return {
              conversationId,
              reply: turn.text,
              transaction: ctx.createdTransaction,
              pendingActions: ctx.pendingActions,
              actions: ctx.completedActions,
              autoApplied: ctx.autoApplied || undefined,
            }
          }

          // Partial narration before tools isn't the final reply — clear the bubble.
          if (turn.text) hooks?.onReset?.()

          const toolResultParts: NeutralPart[] = []
          for (const call of turn.toolCalls) {
            try {
              await ensureProgressChannel()
              await progressChannel.send({
                type: 'broadcast',
                event: 'tool',
                payload: { tool: call.name, id: call.id, status: 'running' },
              })
            } catch {
              /* degrade silently */
            }
            let summary: string
            let threw = false
            try {
              summary = await dispatchTool(ctx, call.name, call.args)
            } catch (err) {
              // Agentic reliability: a tool that throws must never abort the whole
              // turn or leave a chain half-applied. Feed the failure back so the
              // model can recover or tell the user, and so every tool_call keeps a
              // matching result (unbalanced pairs break the provider's next turn).
              // Log only the message, never the raw error object — it can carry
              // row data (e.g. a Postgres constraint error echoing values).
              console.error(`Tool ${call.name} threw:`, err instanceof Error ? err.message : String(err))
              summary = `Tool "${call.name}" failed: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was saved for this step — do not claim it succeeded.`
              threw = true
            }
            const action = buildCompletedAction(call, summary, ctx, threw)
            if (action) ctx.completedActions.push(action)
            try {
              await ensureProgressChannel()
              await progressChannel.send({
                type: 'broadcast',
                event: 'tool',
                payload: {
                  tool: call.name,
                  id: call.id,
                  status: action?.status === 'error' || threw ? 'error' : 'done',
                  summary: action?.summary,
                  label: action?.label,
                },
              })
            } catch {
              /* degrade silently */
            }
            toolResultParts.push({ type: 'tool_result', id: call.id, name: call.name, result: summary })
          }

          const toolResultMessage: NeutralMessage = { role: 'user', parts: toolResultParts }
          await insertMessage(supabase, conversationId, toolResultMessage)
          neutralHistory.push(toolResultMessage)
        }
      } finally {
        try {
          await supabase.removeChannel(progressChannel)
        } catch {
          /* ignore */
        }
      }

      return {
        conversationId,
        reply: "Sorry, I'm having trouble completing that one — could you try rephrasing?",
        transaction: ctx.createdTransaction,
        pendingActions: ctx.pendingActions,
        actions: ctx.completedActions,
        autoApplied: ctx.autoApplied || undefined,
      }
    }

    if (wantsStream) {
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder()
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          }
          try {
            send('meta', { conversationId })
            const result = await runAgent({
              onToken: (text) => send('token', { text }),
              onReset: () => send('reset', {}),
            })
            send('done', result)
          } catch (error) {
            console.error(error instanceof Error ? error.message : String(error))
            send('error', { error: 'Something went wrong on our side — please try again.' })
          } finally {
            controller.close()
          }
        },
      })
      return new Response(stream, {
        headers: {
          ...cors,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      })
    }

    return respond(await runAgent())
  } catch (error) {
    // Log the detail, return a generic message: a raw error (e.g. a Postgres
    // constraint failure) can echo schema names or row values to the client.
    console.error(error instanceof Error ? error.message : String(error))
    return respond({ error: 'Something went wrong on our side — please try again.' }, 500)
  }
})

// --- Model orchestration -----------------------------------------------

// Bounds the worst case of a hung upstream call — without this, a stalled
// Gemini/Groq request left "Thinking…" indefinitely with no way to recover.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ])
}

async function callModel(
  history: NeutralMessage[],
  systemInstruction: string,
  tools: ToolDefinition[],
  onDelta?: (text: string) => void,
): Promise<ModelTurn> {
  if (onDelta) {
    try {
      return await withTimeout(
        callGeminiStream(history, systemInstruction, tools, onDelta),
        MODEL_TIMEOUT_MS,
        'Gemini',
      )
    } catch (error) {
      console.error(
        'Gemini stream failed, falling back to Groq stream:',
        error instanceof Error ? error.message : String(error),
      )
      return await withTimeout(
        callGroqStream(history, systemInstruction, tools, onDelta),
        MODEL_TIMEOUT_MS,
        'Groq',
      )
    }
  }
  try {
    return await withTimeout(callGemini(history, systemInstruction, tools), MODEL_TIMEOUT_MS, 'Gemini')
  } catch (error) {
    console.error('Gemini call failed, falling back to Groq:', error instanceof Error ? error.message : String(error))
    return await withTimeout(callGroq(history, systemInstruction, tools), MODEL_TIMEOUT_MS, 'Groq')
  }
}

async function callGemini(
  history: NeutralMessage[],
  systemInstruction: string,
  tools: ToolDefinition[],
): Promise<ModelTurn> {
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  const contents = toGeminiContents(history)

  const response = await genAI.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: { systemInstruction, tools: [{ functionDeclarations: tools }], maxOutputTokens: MAX_OUTPUT_TOKENS },
  })

  const toolCalls = (response.functionCalls ?? []).map((call, index) => ({
    id: call.id ?? `gemini-call-${index}`,
    name: call.name ?? '',
    args: (call.args ?? {}) as Record<string, unknown>,
  }))

  return { text: response.text ?? '', toolCalls }
}

async function callGeminiStream(
  history: NeutralMessage[],
  systemInstruction: string,
  tools: ToolDefinition[],
  onDelta: (text: string) => void,
): Promise<ModelTurn> {
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  const stream = await genAI.models.generateContentStream({
    model: GEMINI_MODEL,
    contents: toGeminiContents(history),
    config: { systemInstruction, tools: [{ functionDeclarations: tools }], maxOutputTokens: MAX_OUTPUT_TOKENS },
  })

  let text = ''
  const toolById = new Map<string, { id: string; name: string; args: Record<string, unknown> }>()
  let toolIndex = 0

  for await (const chunk of stream) {
    const piece = typeof chunk.text === 'string' ? chunk.text : ''
    if (piece) {
      text += piece
      onDelta(piece)
    }
    for (const call of chunk.functionCalls ?? []) {
      const id = call.id ?? `gemini-call-${toolIndex++}`
      toolById.set(id, {
        id,
        name: call.name ?? '',
        args: (call.args ?? {}) as Record<string, unknown>,
      })
    }
  }

  return { text, toolCalls: [...toolById.values()] }
}

async function callGroq(
  history: NeutralMessage[],
  systemInstruction: string,
  tools: ToolDefinition[],
): Promise<ModelTurn> {
  const messages = toGroqMessages(history, systemInstruction)
  const groqTools = tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parametersJsonSchema },
  }))

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GROQ_MODEL, messages, tools: groqTools, max_tokens: MAX_OUTPUT_TOKENS }),
  })

  if (!res.ok) {
    throw new Error(`Groq error ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  const message = data.choices[0].message

  // A model can emit malformed tool-call JSON; letting JSON.parse throw here
  // used to escape callGroq entirely (this is the fallback provider, so
  // nothing catches it) and 500 the whole request. Drop just that call
  // instead — dispatchTool's default branch handles an empty/unknown name.
  const toolCalls = (message.tool_calls ?? []).map((call: {
    id: string
    function: { name: string; arguments: string }
  }) => {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(call.function.arguments || '{}')
    } catch {
      console.error(`Groq returned malformed tool args for ${call.function.name}:`, call.function.arguments)
    }
    return { id: call.id, name: call.function.name, args }
  })

  return { text: message.content ?? '', toolCalls }
}

async function callGroqStream(
  history: NeutralMessage[],
  systemInstruction: string,
  tools: ToolDefinition[],
  onDelta: (text: string) => void,
): Promise<ModelTurn> {
  const messages = toGroqMessages(history, systemInstruction)
  const groqTools = tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parametersJsonSchema },
  }))

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      tools: groqTools,
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
    }),
  })

  if (!res.ok) {
    throw new Error(`Groq error ${res.status}: ${await res.text()}`)
  }
  if (!res.body) {
    throw new Error('Groq stream returned an empty body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  const toolArgs: Record<number, { id: string; name: string; arguments: string }> = {}

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let chunk: {
        choices?: Array<{
          delta?: {
            content?: string | null
            tool_calls?: Array<{
              index?: number
              id?: string
              function?: { name?: string; arguments?: string }
            }>
          }
        }>
      }
      try {
        chunk = JSON.parse(payload)
      } catch {
        continue
      }
      const delta = chunk.choices?.[0]?.delta
      if (!delta) continue
      if (typeof delta.content === 'string' && delta.content) {
        text += delta.content
        onDelta(delta.content)
      }
      for (const tc of delta.tool_calls ?? []) {
        const index = tc.index ?? 0
        const existing = toolArgs[index] ?? { id: tc.id ?? `groq-call-${index}`, name: '', arguments: '' }
        if (tc.id) existing.id = tc.id
        if (tc.function?.name) existing.name = tc.function.name
        if (tc.function?.arguments) existing.arguments += tc.function.arguments
        toolArgs[index] = existing
      }
    }
  }

  const toolCalls = Object.values(toolArgs).map((call) => {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(call.arguments || '{}')
    } catch {
      console.error(`Groq stream returned malformed tool args for ${call.name}:`, call.arguments)
    }
    return { id: call.id, name: call.name, args }
  })

  return { text, toolCalls }
}

// --- Provider adapters ---------------------------------------------------

function toGeminiContents(messages: NeutralMessage[]): Content[] {
  return messages.map((message) => {
    const parts: Part[] = []
    for (const part of message.parts) {
      if (part.type === 'text') {
        parts.push({ text: part.text })
      } else if (part.type === 'tool_call') {
        parts.push({ functionCall: { name: part.name, args: part.args, id: part.id } })
      } else if (part.type === 'tool_result') {
        parts.push({ functionResponse: { name: part.name, response: { result: part.result }, id: part.id } })
      }
    }
    return { role: message.role === 'assistant' ? 'model' : 'user', parts }
  })
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

function toGroqMessages(messages: NeutralMessage[], systemInstruction: string): GroqMessage[] {
  const out: GroqMessage[] = [{ role: 'system', content: systemInstruction }]

  for (const message of messages) {
    const textParts = message.parts.filter((p) => p.type === 'text')
    const toolCalls = message.parts.filter((p) => p.type === 'tool_call')
    const toolResults = message.parts.filter((p) => p.type === 'tool_result')
    const text = textParts.map((p) => (p as { text: string }).text).join('\n')

    if (message.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: text || null,
        tool_calls: toolCalls.length
          ? toolCalls.map((call) => {
              const tc = call as Extract<NeutralPart, { type: 'tool_call' }>
              return {
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.name, arguments: JSON.stringify(tc.args) },
              }
            })
          : undefined,
      })
    } else {
      if (text) out.push({ role: 'user', content: text })
      for (const result of toolResults) {
        const tr = result as Extract<NeutralPart, { type: 'tool_result' }>
        out.push({ role: 'tool', tool_call_id: tr.id, content: tr.result })
      }
    }
  }

  return out
}

// --- Supabase helpers ------------------------------------------------------

function jsonResponse(body: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Idle threshold before starting a fresh conversation (continuity via ai_memories). */
const CONVERSATION_IDLE_MS = 6 * 60 * 60 * 1000

async function getOrCreateConversation(
  supabase: SupabaseClient,
  userId: string,
  walletId: string,
  conversationId: string | undefined,
): Promise<string> {
  if (conversationId) {
    const { data } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('id', conversationId)
      .maybeSingle()
    if (data) {
      const { data: latest } = await supabase
        .from('chat_messages')
        .select('created_at')
        .eq('conversation_id', data.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const lastAt = latest?.created_at ? new Date(latest.created_at).getTime() : 0
      if (!lastAt || Date.now() - lastAt < CONVERSATION_IDLE_MS) {
        return data.id
      }
      // Stale session — fall through to insert a fresh conversation.
    }
  }

  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({ user_id: userId, wallet_id: walletId })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

async function fetchHistory(supabase: SupabaseClient, conversationId: string): Promise<NeutralMessage[]> {
  // Newest 40 first, then reverse to chronological order for the model.
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(40)

  if (error) throw error
  const rows = (data ?? []).reverse().map((row) => ({
    role: row.role as 'user' | 'assistant',
    parts: row.content as NeutralPart[],
  }))
  // A window that starts mid tool-exchange leaves unbalanced tool_result pairs
  // and breaks the provider call — drop leading messages until a plain user text.
  return trimHistoryToSafeStart(rows)
}

/** Drop leading messages until the first is a user message with a text part. */
function trimHistoryToSafeStart(messages: NeutralMessage[]): NeutralMessage[] {
  let start = 0
  while (start < messages.length) {
    const m = messages[start]
    const first = m.parts[0]
    if (m.role === 'user' && first?.type === 'text') break
    start++
  }
  return messages.slice(start)
}

async function insertMessage(supabase: SupabaseClient, conversationId: string, message: NeutralMessage) {
  const { error } = await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, role: message.role, content: message.parts })
  if (error) throw error
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

interface ChatProfile {
  personality: string
  mode: string
  primaryGoal: string | null
  householdSize: number | null
  incomeRange: string | null
  gender: string
}

async function fetchProfile(supabase: SupabaseClient, userId: string): Promise<ChatProfile> {
  const { data } = await supabase
    .from('profiles')
    .select('ai_personality, mode, primary_goal, household_size, income_range, gender')
    .eq('id', userId)
    .maybeSingle()
  return {
    personality: data?.ai_personality ?? 'balanced_coach',
    mode: data?.mode ?? 'individual',
    primaryGoal: data?.primary_goal ?? null,
    householdSize: data?.household_size ?? null,
    incomeRange: data?.income_range ?? null,
    gender: data?.gender ?? 'prefer_not_to_say',
  }
}

// Onboarding-collected context, woven into the system prompt. The gender line
// is a hard requirement, not a suggestion: it may only ever shape tone, never
// financial advice, calculations, or any other logic — see migration
// 0029_onboarding_profile_fields.sql.
function buildUserContextSection(profile: ChatProfile): string {
  const lines: string[] = []

  if (profile.primaryGoal && GOAL_LABELS[profile.primaryGoal]) {
    lines.push(
      `Their stated primary financial goal right now is to ${GOAL_LABELS[profile.primaryGoal]}. Where relevant, connect your guidance back to this without being repetitive about it.`,
    )
  }

  if (profile.householdSize && profile.mode !== 'individual') {
    const noun = profile.mode === 'business' ? 'team' : 'household'
    lines.push(`They are managing money for a ${noun} of ${profile.householdSize} people.`)
  }

  if (profile.incomeRange && INCOME_RANGE_LABELS[profile.incomeRange]) {
    lines.push(
      `They describe their financial situation as "${INCOME_RANGE_LABELS[profile.incomeRange]}" — a qualitative ` +
        'band, not an exact figure. Never ask for or assume a specific income number from this alone.',
    )
  }

  if (profile.gender !== 'prefer_not_to_say' && GENDER_LABELS[profile.gender]) {
    lines.push(
      `The user identifies as ${GENDER_LABELS[profile.gender]}. Use this ONLY to make tone and phrasing feel ` +
        'natural — it must NEVER influence financial advice, calculations, risk framing, or any other logic. ' +
        'Treat all users identically in the substance of your guidance regardless of this field.',
    )
  }

  return lines.length > 0 ? `\n\n${lines.join(' ')}` : ''
}

interface Memory {
  kind: string
  content: string
  mood: string | null
}

// A bounded slice of the Financial Journal (roadmap bet #10), which can grow
// unbounded — the prompt only needs enough context to feel like Penda
// remembers, not a full transcript. Durable kinds (preference/fact) are
// prioritized over recency: a long-lived "never guilt-trip fast food"
// preference must not get pushed out of the window by a burst of recent mood
// notes (audit finding).
const MAX_MEMORIES_IN_PROMPT = 20
const MAX_DURABLE_MEMORIES = 12
const MEMORY_FETCH_WINDOW = 60

async function fetchMemories(supabase: SupabaseClient, userId: string): Promise<Memory[]> {
  const { data } = await supabase
    .from('ai_memories')
    .select('kind, content, mood, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MEMORY_FETCH_WINDOW)
  const rows = data ?? []

  const isDurable = (m: { kind: string }) => m.kind === 'preference' || m.kind === 'fact'
  const durable = rows.filter(isDurable).slice(0, MAX_DURABLE_MEMORIES)
  const durableSet = new Set(durable)
  const rest = rows.filter((m) => !durableSet.has(m))

  return [...durable, ...rest.slice(0, MAX_MEMORIES_IN_PROMPT - durable.length)]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)) // prompt stays newest-first
    .map(({ kind, content, mood }) => ({ kind, content, mood }))
}

async function fetchWalletCurrency(supabase: SupabaseClient, walletId: string): Promise<string> {
  const { data } = await supabase.from('wallets').select('base_currency').eq('id', walletId).maybeSingle()
  return data?.base_currency ?? 'USD'
}

function buildSystemInstruction(
  profile: ChatProfile,
  currency: string,
  memories: Memory[],
  pageContext?: PageContext,
): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency
  const personaName = PERSONALITY_NAMES[profile.personality] ?? PERSONALITY_NAMES.balanced_coach
  const screenLine = pageContext
    ? pageContext.entityId
      ? `The user is currently on the ${pageContext.page} page viewing record ${pageContext.entityId}; "this"/"it" likely refers to that record.\n\n`
      : `The user is currently on the ${pageContext.page} page.\n\n`
    : ''
  const houseRules = `You are ${personaName}, an AI assistant persona embedded in Penda, a personal finance
app. Penda is the app you live in, not your name — always introduce and refer to yourself as
${personaName}, never as "Penda". Your job in this conversation is to help the user log
transactions by talking naturally — you are not a generic chatbot, you are the primary way this
user records spending and income.

${MODE_AI_CONTEXT[profile.mode] ?? MODE_AI_CONTEXT.individual}${buildUserContextSection(profile)}
This wallet's currency is ${currency} (${symbol}). ALL amounts — in the transactions you log and in
everything you say back — are in ${currency}. When you mention money, write it with "${symbol}"
(e.g. ${symbol}12, ${symbol}2000). Never use "$" or any other currency's symbol unless "${symbol}"
literally is "$". The user only ever types plain numbers; the currency is always ${currency}.

When the user describes a purchase, payment, or income (e.g. "I spent 12 on coffee at Blue Bottle",
"got paid 2000"), call the create_transaction tool with your best judgment for amount, type,
category, merchant, and date.

Some messages imply more than one thing happened to the money — reason about what actually
happened and record all of it:
- Borrowing ("I borrowed K500 from Amara", "took a loan") or lending / being owed ("I lent Tich
  K200", "Tich owes me K200"): cash actually changed hands, so call log_borrowed_or_lent_money with
  direction "i_owe" for borrowing (wallet goes UP) or "owed_to_me" for lending (wallet goes DOWN).
  This logs the transaction and the debt together in one atomic step — never call create_transaction
  and create_debt separately for this, since if the second call failed after the first succeeded the
  ledger would be left half-updated with a transaction but no matching debt.
- If money was only promised and hasn't moved yet, record just the debt with create_debt.
Never record only one half of a two-sided event.

If you are genuinely unsure how to record something — the type is ambiguous, you can't tell whether
it's a debt, or no category fits — ask ONE short clarifying question instead of guessing or doing
nothing. A quick question beats a wrong entry or silence. (A merely uncertain amount is the
exception: make a reasonable call there and let the user correct it.)

You can also read, edit, and remove the user's data — not just create it:
- ANSWERING QUESTIONS ("what did I spend this week?", "how much do I owe Amara?", "show my
  budgets"): use query_records to look things up, or get_spending_summary for totals over a period.
  Never say you can't check — you can. Reads run immediately and freely.
- CREATING budgets, goals, or categories: use create_budget, create_goal, create_category.
- EDITING or DELETING something that already exists ("actually it was K15 not K10", "delete that
  duplicate", "rename the trip goal"): you MUST first find the exact record with query_records to
  get its id, then call update_record or delete_record with that id. NEVER create a new record to
  "fix" an old one — that leaves a duplicate.

Editing and deleting are special: update_record and delete_record do NOT take effect immediately.
They stage the change and show the user a confirmation card they must tap. So when you edit or
delete, DO NOT say it's done — phrase your reply as the pending question the card is asking (e.g.
"Want me to change that to K15?" or "Delete the K10 tea entry?"). Only after the user confirms is it
actually applied. If a tool result says a change was staged, treat it as pending, not complete.

After a create or read result comes back, reply with a short, natural confirmation or answer. Do not
restate every field back at the user like a receipt — just confirm briefly in your own voice.

You have a memory across conversations (the Financial Journal): use save_memory when the user states
a preference ("I never want to see fast food guilt-tripped"), shares a fact worth recalling ("I freelance
on the side"), states a goal's real motivation, or reveals a behavioral pattern (e.g. "I stress-buy after
work" — kind "mood" with a short mood label). Use it sparingly, for things genuinely worth recalling
later, not routine transaction chatter. Weave anything relevant from what you already remember (below)
into your replies naturally — don't just list it back.${buildMemorySection(memories)}`

  const personalityFragment = PERSONALITY_PROMPTS[profile.personality] ?? PERSONALITY_PROMPTS.balanced_coach

  // Volatile context (current page, today's date) goes LAST: everything above
  // it is stable across a user's requests, so Gemini's implicit prefix
  // caching can reuse it. With the page line mid-prompt, every navigation
  // invalidated the cached prefix from that point down (audit finding).
  return `${houseRules}\n\n${personalityFragment}\n\n${screenLine}Today's date is ${today()}.`
}

function buildMemorySection(memories: Memory[]): string {
  if (memories.length === 0) return ''
  const lines = memories.map((m) => `- (${m.kind}${m.mood ? `: ${m.mood}` : ''}) ${m.content}`)
  return `\n\nWhat you remember about this user:\n${lines.join('\n')}`
}

function buildTools(categories: Category[]): ToolDefinition[] {
  const categoryNames = categories.map((c) => c.name)

  return [
    {
      name: 'create_transaction',
      description: 'Log a new expense or income transaction in the user wallet.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['expense', 'income'] },
          amount: { type: 'number', description: 'Amount as a decimal number, e.g. 12.50' },
          category: { type: 'string', enum: categoryNames },
          merchant: { type: 'string' },
          description: { type: 'string' },
          transaction_date: {
            type: 'string',
            description: 'ISO date YYYY-MM-DD. Use today unless the user specifies otherwise.',
          },
        },
        required: ['type', 'amount', 'category', 'transaction_date'],
      },
    },
    {
      name: 'create_debt',
      description:
        'Record a debt where money has NOT moved yet — just a promise or IOU with nothing exchanged. ' +
        'Use log_borrowed_or_lent_money instead whenever cash actually changed hands, so the wallet ' +
        'transaction and the debt save together atomically.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Short label, e.g. "Loan from Amara" or "Lent to Tich".',
          },
          direction: { type: 'string', enum: ['i_owe', 'owed_to_me'] },
          amount: { type: 'number', description: 'Principal amount as a decimal, e.g. 500.' },
          counterparty: { type: 'string', description: 'Who the debt is with, if mentioned.' },
          due_date: { type: 'string', description: 'Optional ISO date YYYY-MM-DD when it is due.' },
        },
        required: ['name', 'direction', 'amount'],
      },
    },
    {
      name: 'log_borrowed_or_lent_money',
      description:
        'Atomically record BOTH sides of borrowing or lending money — the wallet transaction AND the ' +
        'debt — in one step, so they save together or not at all. Use this INSTEAD of create_transaction ' +
        'plus create_debt whenever cash actually changes hands for a loan: borrowing (direction "i_owe", ' +
        'wallet goes up) or lending / being owed (direction "owed_to_me", wallet goes down). If money was ' +
        'only promised and hasn\'t moved yet, use create_debt alone instead.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['i_owe', 'owed_to_me'] },
          amount: { type: 'number', description: 'Amount as a decimal number, e.g. 500.' },
          name: { type: 'string', description: 'Short label for the debt, e.g. "Loan from Amara".' },
          counterparty: { type: 'string', description: 'Who the debt is with, if mentioned.' },
          category: { type: 'string', enum: categoryNames, description: 'Optional category for the transaction.' },
          due_date: { type: 'string', description: 'Optional ISO date YYYY-MM-DD when the debt is due.' },
          transaction_date: {
            type: 'string',
            description: 'ISO date YYYY-MM-DD the money moved. Use today unless the user specifies otherwise.',
          },
        },
        required: ['direction', 'amount', 'name'],
      },
    },
    {
      name: 'create_budget',
      description: 'Create a spending budget for a category over a weekly or monthly period.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Budget limit as a decimal, e.g. 500.' },
          period: { type: 'string', enum: ['weekly', 'monthly'] },
          category: { type: 'string', enum: categoryNames, description: 'Category this budget caps.' },
          rollover: { type: 'boolean', description: 'Whether unused budget carries into the next period.' },
        },
        required: ['amount', 'period'],
      },
    },
    {
      name: 'create_goal',
      description: 'Create a savings goal the user is working toward.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'What the goal is, e.g. "New laptop".' },
          target_amount: { type: 'number', description: 'Target amount to save, as a decimal.' },
          current_amount: { type: 'number', description: 'Amount already saved, if any. Defaults to 0.' },
          target_date: { type: 'string', description: 'Optional ISO date YYYY-MM-DD to hit the goal by.' },
        },
        required: ['name', 'target_amount'],
      },
    },
    {
      name: 'create_category',
      description: 'Create a new spending/income category for this wallet.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Category name, e.g. "Transport".' },
          icon: { type: 'string', description: 'Optional emoji for the category.' },
        },
        required: ['name'],
      },
    },
    {
      name: 'query_records',
      description:
        'Look up the user\'s existing records to answer questions or to find the id of something the ' +
        'user wants to edit or delete. Returns each record WITH its id. Runs immediately.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', enum: ['transaction', 'debt', 'budget', 'goal', 'category'] },
          search: { type: 'string', description: 'Optional text to match on merchant/description/name.' },
          since: { type: 'string', description: 'Transactions only: ISO date lower bound (inclusive).' },
          until: { type: 'string', description: 'Transactions only: ISO date upper bound (inclusive).' },
          limit: { type: 'number', description: 'Max rows to return. Defaults to 10.' },
        },
        required: ['domain'],
      },
    },
    {
      name: 'get_spending_summary',
      description:
        'Total the user\'s spending and income over a date range (e.g. this week, last month). Use ' +
        'this to answer "how much did I spend" questions. Runs immediately.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          since: { type: 'string', description: 'ISO date YYYY-MM-DD, start of the range (inclusive).' },
          until: { type: 'string', description: 'ISO date YYYY-MM-DD, end of the range. Defaults to today.' },
        },
        required: ['since'],
      },
    },
    {
      name: 'update_record',
      description:
        'Propose an edit to an existing record. Does NOT apply immediately — it stages the change and ' +
        'asks the user to confirm on a card. Find the record id first with query_records. Editable ' +
        'fields by domain: transaction {amount, type, category, merchant, description, transaction_date}; ' +
        'debt {name, direction, counterparty, amount, due_date}; budget {amount, period, category, ' +
        'rollover}; goal {name, target_amount, current_amount, target_date}; category {name, icon}; ' +
        'wallet {name}. Amounts are decimals; category is a category name.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', enum: ['transaction', 'debt', 'budget', 'goal', 'category', 'wallet'] },
          id: { type: 'string', description: 'The record id from query_records.' },
          changes: {
            type: 'object',
            description: 'Object of the fields to change to their new values. Only editable fields apply.',
          },
        },
        required: ['domain', 'id', 'changes'],
      },
    },
    {
      name: 'delete_record',
      description:
        'Propose deleting an existing record. Does NOT delete immediately — it stages the removal and ' +
        'asks the user to confirm on a card. Find the record id first with query_records. Deleting a ' +
        'wallet or bulk-deleting is not allowed.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string', enum: ['transaction', 'debt', 'budget', 'goal', 'category'] },
          id: { type: 'string', description: 'The record id from query_records.' },
        },
        required: ['domain', 'id'],
      },
    },
    {
      name: 'save_memory',
      description:
        'Save something worth remembering about the user for future conversations — a stated preference, ' +
        'a fact they shared, a goal\'s real motivation, or a noticed behavioral/emotional pattern (kind ' +
        '"mood", e.g. "stress-buys after work"). Runs immediately. Use sparingly — only for things ' +
        'genuinely worth recalling later, not routine transaction logging.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['note', 'mood', 'preference', 'fact'] },
          content: { type: 'string', description: 'The thing to remember, in a short sentence.' },
          mood: { type: 'string', description: 'Optional short mood label, mainly for kind "mood".' },
        },
        required: ['kind', 'content'],
      },
    },
    {
      name: 'teach_categorization',
      description:
        'Teach Penda a lasting categorization rule, e.g. "always categorize Uber as Transport". ' +
        'Runs immediately. Use when the user explicitly teaches a merchant/phrase → category mapping.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          match_value: { type: 'string', description: 'Merchant or phrase to match (e.g. Uber).' },
          category: { type: 'string', description: 'Existing category name.' },
          match_type: {
            type: 'string',
            enum: ['merchant_contains', 'description_contains'],
            description: 'Defaults to merchant_contains.',
          },
        },
        required: ['match_value', 'category'],
      },
    },
  ]
}

// --- Action trail (UI) -----------------------------------------------------

const STAGING_TOOLS = new Set(['update_record', 'delete_record'])

const TOOL_TRAIL_META: Record<string, { domain: string; label: string }> = {
  create_transaction: { domain: 'transaction', label: 'Logged transaction' },
  create_debt: { domain: 'debt', label: 'Recorded debt' },
  log_borrowed_or_lent_money: { domain: 'debt', label: 'Recorded loan' },
  create_budget: { domain: 'budget', label: 'Created budget' },
  create_goal: { domain: 'goal', label: 'Created goal' },
  create_category: { domain: 'category', label: 'Created category' },
  query_records: { domain: 'query', label: 'Looked that up' },
  get_spending_summary: { domain: 'summary', label: 'Tallied spend' },
  save_memory: { domain: 'memory', label: 'Remembered that' },
  teach_categorization: { domain: 'memory', label: 'Taught Penda' },
  money_habit: { domain: 'goal', label: 'Saved via habit' },
}

function toolFailed(result: string, threw: boolean): boolean {
  if (threw) return true
  return /^(Failed|Tool "|Amount must|Debt amount|Budget amount|Goal target|A category|A memory|I can't|I need|Nothing to|Unknown tool|Deleting )/i
    .test(result)
}

function fmtAmount(amount: number, symbol: string): string {
  if (!Number.isFinite(amount)) return String(amount)
  return `${symbol}${amount.toFixed(2)}`
}

function buildCompletedAction(
  call: { id: string; name: string; args: Record<string, unknown> },
  result: string,
  ctx: ToolContext,
  threw: boolean,
): CompletedAction | null {
  // Confirm cards already cover staged update/delete — don't duplicate them.
  if (STAGING_TOOLS.has(call.name)) return null

  const meta = TOOL_TRAIL_META[call.name] ?? { domain: 'general', label: 'Did something' }
  const failed = toolFailed(result, threw)
  const args = call.args
  let label = meta.label
  let summary = result
  let targetId: string | undefined
  const details: Record<string, string> = {}

  switch (call.name) {
    case 'create_transaction': {
      const type = String(args.type ?? 'expense')
      label = type === 'income' ? 'Logged income' : type === 'transfer' ? 'Logged transfer' : 'Logged expense'
      const amount = Number(args.amount)
      const merchant = typeof args.merchant === 'string' ? args.merchant.trim() : ''
      const category = typeof args.category === 'string' ? args.category.trim() : ''
      summary = [merchant || null, Number.isFinite(amount) && amount > 0 ? fmtAmount(amount, ctx.symbol) : null]
        .filter(Boolean)
        .join(' · ') || (failed ? 'Couldn’t save that' : 'Saved')
      if (merchant) details.Merchant = merchant
      if (Number.isFinite(amount) && amount > 0) details.Amount = fmtAmount(amount, ctx.symbol)
      if (category) details.Category = category
      if (typeof args.transaction_date === 'string') details.Date = args.transaction_date
      const tx = ctx.createdTransaction
      if (tx && typeof tx.id === 'string') targetId = tx.id
      break
    }
    case 'create_debt': {
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      const amount = Number(args.amount)
      const counterparty = typeof args.counterparty === 'string' ? args.counterparty.trim() : ''
      summary = [name || 'Debt', Number.isFinite(amount) && amount > 0 ? fmtAmount(amount, ctx.symbol) : null]
        .filter(Boolean)
        .join(' · ')
      if (name) details.Name = name
      if (counterparty) details.With = counterparty
      if (Number.isFinite(amount) && amount > 0) details.Amount = fmtAmount(amount, ctx.symbol)
      targetId = ctx.createdIds.debt
      break
    }
    case 'log_borrowed_or_lent_money': {
      const direction = args.direction === 'owed_to_me' ? 'Lent' : 'Borrowed'
      label = direction === 'Lent' ? 'Recorded lending' : 'Recorded borrowing'
      const amount = Number(args.amount)
      const counterparty = typeof args.counterparty === 'string' ? args.counterparty.trim() : ''
      summary = [direction, counterparty || null, Number.isFinite(amount) && amount > 0 ? fmtAmount(amount, ctx.symbol) : null]
        .filter(Boolean)
        .join(' · ')
      if (counterparty) details.With = counterparty
      if (Number.isFinite(amount) && amount > 0) details.Amount = fmtAmount(amount, ctx.symbol)
      const tx = ctx.createdTransaction
      if (tx && typeof tx.id === 'string') targetId = tx.id
      break
    }
    case 'create_budget': {
      const amount = Number(args.amount)
      const period = args.period === 'weekly' ? 'weekly' : 'monthly'
      const category = typeof args.category === 'string' ? args.category.trim() : ''
      summary = [category || 'Budget', period, Number.isFinite(amount) && amount > 0 ? fmtAmount(amount, ctx.symbol) : null]
        .filter(Boolean)
        .join(' · ')
      if (category) details.Category = category
      details.Period = period
      if (Number.isFinite(amount) && amount > 0) details.Amount = fmtAmount(amount, ctx.symbol)
      targetId = ctx.createdIds.budget
      break
    }
    case 'create_goal': {
      const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : 'Savings goal'
      const target = Number(args.target_amount)
      label = 'Created goal'
      summary = [name, Number.isFinite(target) && target > 0 ? fmtAmount(target, ctx.symbol) : null]
        .filter(Boolean)
        .join(' · ')
      details.Name = name
      if (Number.isFinite(target) && target > 0) details.Target = fmtAmount(target, ctx.symbol)
      targetId = ctx.createdIds.goal
      break
    }
    case 'create_category': {
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      summary = name || (failed ? 'Couldn’t create category' : 'Category created')
      if (name) details.Name = name
      targetId = ctx.createdIds.category
      break
    }
    case 'teach_categorization': {
      const matchValue = typeof args.match_value === 'string' ? args.match_value.trim() : ''
      const category = typeof args.category === 'string' ? args.category.trim() : ''
      label = 'Taught Penda'
      summary = matchValue && category ? `${matchValue} → ${category}` : result
      if (matchValue) details.Match = matchValue
      if (category) details.Category = category
      break
    }
    case 'query_records': {
      const domain = typeof args.domain === 'string' ? args.domain : 'records'
      const search = typeof args.search === 'string' ? args.search.trim() : ''
      label = 'Looked that up'
      const match = /^Found (\d+)/.exec(result)
      summary = match
        ? `Found ${match[1]} ${domain}`
        : result.startsWith('No ')
          ? `No ${domain} matched`
          : `Checked ${domain}`
      details.Domain = domain
      if (search) details.Search = search
      break
    }
    case 'get_spending_summary': {
      // Prefer the human sentence the tool already returns.
      summary = result.length > 120 ? `${result.slice(0, 117)}…` : result
      if (typeof args.since === 'string') details.From = args.since
      if (typeof args.until === 'string') details.Until = args.until
      break
    }
    case 'save_memory': {
      const content = typeof args.content === 'string' ? args.content.trim() : ''
      summary = content
        ? content.length > 80
          ? `${content.slice(0, 77)}…`
          : content
        : failed
          ? 'Couldn’t save that'
          : 'Saved'
      if (typeof args.kind === 'string') details.Kind = args.kind
      if (content) details.Note = content
      targetId = ctx.createdIds.memory
      break
    }
    default: {
      summary = failed ? 'Something went wrong' : result.length > 100 ? `${result.slice(0, 97)}…` : result
    }
  }

  if (failed && summary === result) {
    summary = 'Something went wrong'
  }

  return {
    id: call.id,
    tool: call.name,
    domain: meta.domain,
    label,
    summary,
    status: failed ? 'error' : 'done',
    targetId,
    details: Object.keys(details).length ? details : undefined,
  }
}

// --- Tool dispatch ---------------------------------------------------------

async function dispatchTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'create_transaction': {
      const result = await handleCreateTransaction(
        ctx.supabase, ctx.walletId, ctx.userId, ctx.currency, ctx.categories, ctx.rules, args,
      )
      ctx.createdTransaction = result.transaction
      for (const habit of result.habits ?? []) {
        const label = habit.kind === 'round_up' ? 'Rounded up' : 'Paid yourself first'
        ctx.completedActions.push({
          id: crypto.randomUUID(),
          tool: 'money_habit',
          domain: 'goal',
          label,
          summary: `${fmt(habit.amount_minor, ctx.symbol)} → savings`,
          status: 'done',
          targetId: habit.goal_id,
          details: {
            Kind: habit.kind === 'round_up' ? 'Round-up' : 'Pay yourself first',
            Amount: fmt(habit.amount_minor, ctx.symbol),
          },
        })
      }
      return result.summary
    }
    case 'create_debt': {
      const result = await handleCreateDebt(ctx.supabase, ctx.walletId, args)
      if (result.id) ctx.createdIds.debt = result.id
      return result.summary
    }
    case 'log_borrowed_or_lent_money': {
      const result = await handleLogBorrowOrLend(ctx, args)
      ctx.createdTransaction = result.transaction
      if (result.debtId) ctx.createdIds.debt = result.debtId
      return result.summary
    }
    case 'create_budget':
      return await handleCreateBudget(ctx, args)
    case 'create_goal':
      return await handleCreateGoal(ctx, args)
    case 'create_category':
      return await handleCreateCategory(ctx, args)
    case 'query_records':
      return await handleQueryRecords(ctx, args)
    case 'get_spending_summary':
      return await handleSpendingSummary(ctx, args)
    case 'update_record':
      return await stageUpdate(ctx, args)
    case 'delete_record':
      return await stageDelete(ctx, args)
    case 'save_memory':
      return await handleSaveMemory(ctx, args)
    case 'teach_categorization':
      return await handleTeachCategorization(ctx, args)
    default:
      return `Unknown tool "${name}" — no action taken.`
  }
}

async function handleCreateTransaction(
  supabase: SupabaseClient,
  walletId: string,
  userId: string,
  currency: string,
  categories: Category[],
  rules: CategorizationRule[],
  input: Record<string, unknown>,
): Promise<{
  transaction: Record<string, unknown> | null
  summary: string
  habits?: Array<{ kind: string; amount_minor: number; goal_id?: string }>
}> {
  const amount = Number(input.amount)
  if (!amount || amount <= 0) {
    return { transaction: null, summary: 'Amount must be a positive number.' }
  }

  const merchant = typeof input.merchant === 'string' ? input.merchant : null
  const description = typeof input.description === 'string' ? input.description : null

  let categoryId = categories.find((c) => c.name === input.category)?.id ?? null
  for (const rule of rules) {
    const haystack = (rule.match_type === 'merchant_contains' ? merchant : description) ?? ''
    if (haystack.toLowerCase().includes(rule.match_value.toLowerCase())) {
      categoryId = rule.category_id
      break
    }
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      wallet_id: walletId,
      created_by: userId,
      category_id: categoryId,
      amount_minor: Math.round(amount * 100),
      currency,
      type: input.type,
      merchant,
      description,
      transaction_date: input.transaction_date,
      source: 'chat',
    })
    .select('*, category:categories(id, name)')
    .single()

  if (error) {
    return { transaction: null, summary: `Failed to save transaction: ${error.message}` }
  }

  let habits: Array<{ kind: string; amount_minor: number; goal_id?: string }> | undefined
  try {
    const { data: habitRaw } = await supabase.rpc('apply_money_habits', { p_transaction_id: data.id })
    const habitResult = habitRaw as {
      applied?: boolean
      contributions?: Array<{ kind: string; amount_minor: number; goal_id?: string }>
    } | null
    if (habitResult?.applied && habitResult.contributions?.length) {
      habits = habitResult.contributions
    }
  } catch {
    // Habits are additive; transaction already saved.
  }

  return { transaction: data, summary: `Saved: ${JSON.stringify(data)}`, habits }
}

async function handleCreateDebt(
  supabase: SupabaseClient,
  walletId: string,
  input: Record<string, unknown>,
): Promise<{ summary: string; id?: string }> {
  const amount = Number(input.amount)
  if (!amount || amount <= 0) {
    return { summary: 'Debt amount must be a positive number.' }
  }

  const direction = input.direction === 'owed_to_me' ? 'owed_to_me' : 'i_owe'
  const name =
    typeof input.name === 'string' && input.name.trim()
      ? input.name.trim()
      : direction === 'i_owe'
        ? 'Money I borrowed'
        : 'Money owed to me'
  const counterparty = typeof input.counterparty === 'string' ? input.counterparty : null
  const dueDate = typeof input.due_date === 'string' ? input.due_date : null
  const principalMinor = Math.round(amount * 100)

  const { data, error } = await supabase
    .from('debts')
    .insert({
      wallet_id: walletId,
      name,
      direction,
      counterparty,
      principal_minor: principalMinor,
      balance_minor: principalMinor,
      interest_rate: null,
      due_date: dueDate,
    })
    .select('*')
    .single()

  if (error) {
    return { summary: `Failed to save debt: ${error.message}` }
  }

  return { summary: `Saved debt: ${JSON.stringify(data)}`, id: data.id as string }
}

// Atomic multi-tool chain (roadmap bet #4): borrowing/lending needs a wallet
// transaction AND a debt to land together or not at all. Both inserts happen
// inside the log_borrow_or_lend Postgres function (see migration 0026) — if
// either fails, the function raises and the whole call rolls back, so this
// can never leave a transaction with no matching debt (or vice versa).
async function handleLogBorrowOrLend(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<{ transaction: Record<string, unknown> | null; summary: string; debtId?: string }> {
  const amount = Number(input.amount)
  if (!amount || amount <= 0) {
    return { transaction: null, summary: 'Amount must be a positive number.' }
  }

  const direction = input.direction === 'owed_to_me' ? 'owed_to_me' : 'i_owe'
  const name =
    typeof input.name === 'string' && input.name.trim()
      ? input.name.trim()
      : direction === 'i_owe'
        ? 'Money I borrowed'
        : 'Money owed to me'
  const counterparty = typeof input.counterparty === 'string' ? input.counterparty : null
  const dueDate = typeof input.due_date === 'string' ? input.due_date : null
  const transactionDate = typeof input.transaction_date === 'string' ? input.transaction_date : today()
  const categoryId = ctx.categories.find((c) => c.name === input.category)?.id ?? null
  const amountMinor = Math.round(amount * 100)

  const { data: rawData, error } = await ctx.supabase
    .rpc('log_borrow_or_lend', {
      p_wallet_id: ctx.walletId,
      p_direction: direction,
      p_amount_minor: amountMinor,
      p_currency: ctx.currency,
      p_debt_name: name,
      p_counterparty: counterparty,
      p_due_date: dueDate,
      p_category_id: categoryId,
      p_transaction_date: transactionDate,
    })
    .single()
  const data = rawData as { transaction_id: string; debt_id: string } | null

  if (error || !data) {
    const verb = direction === 'i_owe' ? 'loan' : 'money lent'
    const reason = error?.message ?? 'no result returned'
    return {
      transaction: null,
      summary:
        `Failed to record the ${verb}: ${reason}. Nothing was saved — the transaction and the ` +
        `debt roll back together, so there is no half-recorded entry to clean up.`,
    }
  }

  const verb = direction === 'i_owe' ? 'Borrowed' : 'Lent'
  const withWhom = counterparty ? ` ${direction === 'i_owe' ? 'from' : 'to'} ${counterparty}` : ''
  return {
    transaction: { id: data.transaction_id, amount_minor: amountMinor, type: direction === 'i_owe' ? 'income' : 'expense' },
    debtId: data.debt_id,
    summary:
      `${verb} ${fmt(amountMinor, ctx.symbol)}${withWhom} — recorded both the transaction ` +
      `(id ${data.transaction_id}) and the debt (id ${data.debt_id}) together.`,
  }
}

// --- CRUD: read, create, and staged update/delete --------------------------

type Row = Record<string, any>

interface DomainField {
  column: string
  kind: 'minor' | 'category' | 'raw'
}

interface DomainCfg {
  table: string
  select: string
  softDelete: boolean
  deletable: boolean
  fields: Record<string, DomainField>
  guard?: (row: Row) => string | null
  describe: (row: Row, sym: string) => string
}

// The one place that defines what the agent may edit/delete and how each field
// maps onto a DB column. Anything not listed in `fields` is silently ignored on
// update, which is the guardrail against structural edits (e.g. you can rename a
// wallet but not touch its currency; you cannot delete a wallet at all).
const CRUD_DOMAINS: Record<string, DomainCfg> = {
  transaction: {
    table: 'transactions',
    select: '*, category:categories(id, name)',
    softDelete: true,
    deletable: true,
    fields: {
      amount: { column: 'amount_minor', kind: 'minor' },
      type: { column: 'type', kind: 'raw' },
      category: { column: 'category_id', kind: 'category' },
      merchant: { column: 'merchant', kind: 'raw' },
      description: { column: 'description', kind: 'raw' },
      transaction_date: { column: 'transaction_date', kind: 'raw' },
    },
    describe: (row, sym) =>
      `the ${row.type} of ${fmt(row.amount_minor, sym)}` +
      (row.merchant ? ` at ${row.merchant}` : row.description ? ` (${row.description})` : '') +
      ` on ${row.transaction_date}`,
  },
  debt: {
    table: 'debts',
    select: '*',
    softDelete: false,
    deletable: true,
    fields: {
      name: { column: 'name', kind: 'raw' },
      direction: { column: 'direction', kind: 'raw' },
      counterparty: { column: 'counterparty', kind: 'raw' },
      amount: { column: 'principal_minor', kind: 'minor' },
      due_date: { column: 'due_date', kind: 'raw' },
    },
    describe: (row, sym) => `the debt "${row.name}" (${fmt(row.balance_minor, sym)} outstanding)`,
  },
  budget: {
    table: 'budgets',
    select: '*, category:categories(id, name)',
    softDelete: false,
    deletable: true,
    fields: {
      amount: { column: 'amount_minor', kind: 'minor' },
      period: { column: 'period', kind: 'raw' },
      category: { column: 'category_id', kind: 'category' },
      rollover: { column: 'rollover', kind: 'raw' },
    },
    describe: (row, sym) =>
      `the ${row.period} budget of ${fmt(row.amount_minor, sym)}` +
      (row.category ? ` for ${row.category.name}` : ''),
  },
  goal: {
    table: 'savings_goals',
    select: '*',
    softDelete: false,
    deletable: true,
    fields: {
      name: { column: 'name', kind: 'raw' },
      target_amount: { column: 'target_amount_minor', kind: 'minor' },
      current_amount: { column: 'current_amount_minor', kind: 'minor' },
      target_date: { column: 'target_date', kind: 'raw' },
    },
    describe: (row, sym) =>
      `the goal "${row.name}" (${fmt(row.current_amount_minor, sym)} of ${fmt(row.target_amount_minor, sym)})`,
  },
  category: {
    table: 'categories',
    select: '*',
    softDelete: false,
    deletable: true,
    fields: {
      name: { column: 'name', kind: 'raw' },
      icon: { column: 'icon', kind: 'raw' },
    },
    guard: (row) =>
      row.is_system || row.wallet_id === null
        ? 'That is a built-in default category and cannot be changed or removed.'
        : null,
    describe: (row) => `the category "${row.name}"`,
  },
  wallet: {
    table: 'wallets',
    select: '*',
    softDelete: false,
    deletable: false,
    fields: {
      name: { column: 'name', kind: 'raw' },
    },
    describe: (row) => `the wallet "${row.name}"`,
  },
}

function fmt(minor: unknown, sym: string): string {
  const n = Number(minor) || 0
  return `${sym}${(n / 100).toFixed(2)}`
}

function formatCol(column: string, value: unknown, sym: string, categories: Category[]): string {
  if (value === null || value === undefined) return 'none'
  if (column.endsWith('_minor')) return fmt(value, sym)
  if (column === 'category_id') return categories.find((c) => c.id === value)?.name ?? 'Uncategorized'
  return String(value)
}

// Turn the model's friendly {field: value} changes into a validated, column-level
// DB patch plus a human-readable "field: old → new" diff. Unknown/unchanged
// fields are dropped, so the returned patch is exactly what confirm will apply.
function buildPatch(
  cfg: DomainCfg,
  row: Row,
  changes: Record<string, unknown>,
  categories: Category[],
  sym: string,
): { patch: Record<string, unknown>; diff: string[] } {
  const patch: Record<string, unknown> = {}
  const diff: string[] = []

  for (const [key, raw] of Object.entries(changes)) {
    const field = cfg.fields[key]
    if (!field) continue

    let value: unknown
    if (field.kind === 'minor') {
      const n = Number(raw)
      if (!isFinite(n) || n < 0) throw new Error(`"${key}" must be a non-negative number.`)
      value = Math.round(n * 100)
    } else if (field.kind === 'category') {
      const match = categories.find((c) => c.name.toLowerCase() === String(raw).toLowerCase())
      if (!match) throw new Error(`No category named "${raw}".`)
      value = match.id
    } else {
      value = raw === '' ? null : raw
    }

    if (row[field.column] === value) continue
    patch[field.column] = value
    diff.push(
      `${key}: ${formatCol(field.column, row[field.column], sym, categories)} → ${formatCol(field.column, value, sym, categories)}`,
    )
  }

  return { patch, diff }
}

async function loadTarget(ctx: ToolContext, cfg: DomainCfg, domain: string, id: string): Promise<Row> {
  const { data, error } = await ctx.supabase.from(cfg.table).select(cfg.select).eq('id', id).maybeSingle()
  if (error) throw new Error(`Couldn't load that ${domain}: ${error.message}`)
  if (!data) throw new Error(`No ${domain} found with id ${id} — look it up again with query_records; it may have changed or been removed.`)
  return data as Row
}

async function insertPendingAction(
  ctx: ToolContext,
  input: {
    kind: 'update' | 'delete'
    domain: string
    targetId: string
    patch: Record<string, unknown> | null
    summary: string
    status?: 'pending' | 'auto_applied'
  },
): Promise<PendingAction> {
  const status = input.status ?? 'pending'
  const { data, error } = await ctx.supabase
    .from('ai_pending_actions')
    .insert({
      user_id: ctx.userId,
      wallet_id: ctx.walletId,
      conversation_id: ctx.conversationId,
      kind: input.kind,
      domain: input.domain,
      target_id: input.targetId,
      patch: input.patch,
      summary: input.summary,
      status,
      resolved_at: status === 'auto_applied' ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Couldn't stage the change: ${error.message}`)
  return {
    id: data.id,
    kind: input.kind,
    domain: input.domain,
    summary: input.summary,
    targetId: input.targetId,
  }
}

async function shouldAutoApply(ctx: ToolContext): Promise<boolean> {
  const { consent, trust } = await loadConsentAndTrust(ctx.supabase, ctx.userId)
  ctx._consent = consent
  ctx._trust = trust
  return mayActWithoutConfirm(consent, trust)
}

async function autoApplyAction(
  ctx: ToolContext,
  input: {
    kind: 'update' | 'delete'
    domain: string
    targetId: string
    patch: Record<string, unknown> | null
    summary: string
  },
): Promise<string> {
  const pending = await insertPendingAction(ctx, { ...input, status: 'auto_applied' })
  try {
    await executePendingAction(ctx.supabase, {
      id: pending.id,
      kind: input.kind,
      domain: input.domain,
      target_id: input.targetId,
      patch: input.patch,
      summary: input.summary,
      status: 'auto_applied',
    })
  } catch (error) {
    await ctx.supabase.from('ai_pending_actions').delete().eq('id', pending.id)
    throw error
  }
  const consent = ctx._consent ?? normalizeAiConsent(null)
  const trust = ctx._trust ?? normalizeAiTrust(null)
  await persistTrustAfterConfirm(ctx.supabase, ctx.userId, consent, trust)
  ctx.completedActions.push({
    id: pending.id,
    tool: input.kind === 'update' ? 'update_record' : 'delete_record',
    domain: input.domain,
    label: input.kind === 'update' ? 'Updated' : 'Deleted',
    summary: input.summary,
    status: 'done',
    targetId: input.targetId,
  })
  return `Applied (no confirmation needed — user trust/consent allows it): ${input.summary} Tell the user it's done.`
}

async function stageUpdate(ctx: ToolContext, args: Record<string, unknown>): Promise<string> {
  const domain = String(args.domain ?? '')
  const cfg = CRUD_DOMAINS[domain]
  if (!cfg) return `I can't edit "${domain}".`
  const id = String(args.id ?? '')
  if (!id) return 'I need the record id — find it first with query_records.'

  const row = await loadTarget(ctx, cfg, domain, id)
  if (cfg.softDelete && row.deleted_at) return `That ${domain} was already deleted.`
  const guardMsg = cfg.guard?.(row)
  if (guardMsg) return guardMsg

  const changes = (args.changes ?? {}) as Record<string, unknown>
  const { patch, diff } = buildPatch(cfg, row, changes, ctx.categories, ctx.symbol)
  if (Object.keys(patch).length === 0) {
    return `Nothing to change on ${cfg.describe(row, ctx.symbol)} — the values already match.`
  }

  const before: Record<string, unknown> = {}
  for (const key of Object.keys(patch)) before[key] = row[key]
  const patchWithUndo = { ...patch, __before: before }

  const summary = `Update ${cfg.describe(row, ctx.symbol)} — ${diff.join('; ')}.`
  if (await shouldAutoApply(ctx)) {
    ctx.autoApplied = true
    return await autoApplyAction(ctx, { kind: 'update', domain, targetId: id, patch: patchWithUndo, summary })
  }
  ctx.pendingActions.push(
    await insertPendingAction(ctx, { kind: 'update', domain, targetId: id, patch: patchWithUndo, summary }),
  )
  return `Staged, NOT applied: ${summary} The user must confirm it on the card. Ask them to confirm; do not say it's done.`
}

async function stageDelete(ctx: ToolContext, args: Record<string, unknown>): Promise<string> {
  const domain = String(args.domain ?? '')
  const cfg = CRUD_DOMAINS[domain]
  if (!cfg) return `I can't delete "${domain}".`
  if (!cfg.deletable) return `Deleting a ${domain} isn't allowed.`
  const id = String(args.id ?? '')
  if (!id) return 'I need the record id — find it first with query_records.'

  const row = await loadTarget(ctx, cfg, domain, id)
  if (cfg.softDelete && row.deleted_at) return `That ${domain} is already deleted.`
  const guardMsg = cfg.guard?.(row)
  if (guardMsg) return guardMsg

  // Snapshot for undo (soft-delete restore or hard-delete reinsert).
  const before: Record<string, unknown> = { ...row }
  delete before.category
  const patch = { __before: before }

  const summary = `Delete ${cfg.describe(row, ctx.symbol)}.`
  if (await shouldAutoApply(ctx)) {
    ctx.autoApplied = true
    return await autoApplyAction(ctx, { kind: 'delete', domain, targetId: id, patch, summary })
  }
  ctx.pendingActions.push(await insertPendingAction(ctx, { kind: 'delete', domain, targetId: id, patch, summary }))
  return `Staged, NOT applied: ${summary} The user must confirm the deletion on the card. Ask them to confirm; do not say it's done.`
}

function sanitizeSearch(raw: unknown): string {
  // PostgREST .or() filters are comma/paren-delimited, so strip anything that
  // could break out of the ilike pattern; keep letters, digits, and spaces.
  return String(raw ?? '').replace(/[^\p{L}\p{N} ]/gu, '').trim()
}

async function handleQueryRecords(ctx: ToolContext, args: Record<string, unknown>): Promise<string> {
  const domain = String(args.domain ?? '')
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50)
  const search = sanitizeSearch(args.search)
  const { supabase, walletId, symbol } = ctx

  // Filters are applied while the builder is still a FilterBuilder; .order()/
  // .limit() go last, on the awaited call, since they narrow the builder type.
  let rows: Row[] = []
  if (domain === 'transaction') {
    let q = supabase
      .from('transactions')
      .select('id, transaction_date, type, amount_minor, merchant, description, category:categories(name)')
      .eq('wallet_id', walletId)
      .is('deleted_at', null)
    if (args.since) q = q.gte('transaction_date', String(args.since))
    if (args.until) q = q.lte('transaction_date', String(args.until))
    if (search) q = q.or(`merchant.ilike.%${search}%,description.ilike.%${search}%`)
    const { data, error } = await q
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    rows = (data ?? []).map((r: Row) => ({
      id: r.id,
      date: r.transaction_date,
      type: r.type,
      amount: fmt(r.amount_minor, symbol),
      merchant: r.merchant,
      description: r.description,
      category: r.category?.name ?? null,
    }))
  } else if (domain === 'debt') {
    let q = supabase
      .from('debts')
      .select('id, name, direction, counterparty, principal_minor, balance_minor, due_date')
      .eq('wallet_id', walletId)
    if (search) q = q.or(`name.ilike.%${search}%,counterparty.ilike.%${search}%`)
    const { data, error } = await q.limit(limit)
    if (error) throw new Error(error.message)
    rows = (data ?? []).map((r: Row) => ({
      id: r.id,
      name: r.name,
      direction: r.direction,
      counterparty: r.counterparty,
      principal: fmt(r.principal_minor, symbol),
      balance: fmt(r.balance_minor, symbol),
      due_date: r.due_date,
    }))
  } else if (domain === 'budget') {
    const { data, error } = await supabase
      .from('budgets')
      .select('id, amount_minor, period, rollover, category:categories(name)')
      .eq('wallet_id', walletId)
      .limit(limit)
    if (error) throw new Error(error.message)
    rows = (data ?? []).map((r: Row) => ({
      id: r.id,
      amount: fmt(r.amount_minor, symbol),
      period: r.period,
      rollover: r.rollover,
      category: r.category?.name ?? null,
    }))
  } else if (domain === 'goal') {
    let q = supabase
      .from('savings_goals')
      .select('id, name, target_amount_minor, current_amount_minor, target_date')
      .eq('wallet_id', walletId)
    if (search) q = q.ilike('name', `%${search}%`)
    const { data, error } = await q.limit(limit)
    if (error) throw new Error(error.message)
    rows = (data ?? []).map((r: Row) => ({
      id: r.id,
      name: r.name,
      target: fmt(r.target_amount_minor, symbol),
      saved: fmt(r.current_amount_minor, symbol),
      target_date: r.target_date,
    }))
  } else if (domain === 'category') {
    let q = supabase
      .from('categories')
      .select('id, name, icon')
      .or(`wallet_id.eq.${walletId},wallet_id.is.null`)
    if (search) q = q.ilike('name', `%${search}%`)
    const { data, error } = await q.limit(limit)
    if (error) throw new Error(error.message)
    rows = (data ?? []) as Row[]
  } else {
    return `I can't look up "${domain}".`
  }

  if (rows.length === 0) return `No ${domain} records matched.`
  return `Found ${rows.length} ${domain}(s): ${JSON.stringify(rows)}`
}

async function handleSpendingSummary(ctx: ToolContext, args: Record<string, unknown>): Promise<string> {
  const since = String(args.since ?? '')
  if (!since) return 'I need a start date to total spending.'
  const until = args.until ? String(args.until) : today()

  // Aggregated in SQL (migration 0036) — the old version pulled up to 1000
  // raw rows into the function and summed in JS, silently under-reporting
  // any range with more transactions than that.
  const { data, error } = await ctx.supabase.rpc('get_wallet_spending_summary', {
    p_wallet_id: ctx.walletId,
    p_since: since,
    p_until: until,
  })
  if (error) throw new Error(error.message)

  const summary = (data ?? {}) as {
    expense_minor?: number
    income_minor?: number
    expense_count?: number
    top_categories?: Array<{ name: string; amount_minor: number }>
  }
  const top = (summary.top_categories ?? []).map((c) => `${c.name} ${fmt(c.amount_minor, ctx.symbol)}`)

  return (
    `From ${since} to ${until}: spent ${fmt(summary.expense_minor ?? 0, ctx.symbol)} across ` +
    `${summary.expense_count ?? 0} transaction(s); income ${fmt(summary.income_minor ?? 0, ctx.symbol)}.` +
    (top.length ? ` Top spending: ${top.join(', ')}.` : '')
  )
}

async function handleCreateBudget(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const amount = Number(input.amount)
  if (!amount || amount <= 0) return 'Budget amount must be a positive number.'
  const period = input.period === 'weekly' ? 'weekly' : 'monthly'
  const categoryId = ctx.categories.find((c) => c.name === input.category)?.id ?? null

  const { data, error } = await ctx.supabase
    .from('budgets')
    .insert({
      wallet_id: ctx.walletId,
      category_id: categoryId,
      amount_minor: Math.round(amount * 100),
      period,
      rollover: input.rollover === true,
    })
    .select('id')
    .single()
  if (error) return `Failed to create budget: ${error.message}`
  if (data?.id) ctx.createdIds.budget = data.id
  return `Created a ${period} budget of ${fmt(Math.round(amount * 100), ctx.symbol)}.`
}

async function handleCreateGoal(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const target = Number(input.target_amount)
  if (!target || target <= 0) return 'Goal target must be a positive number.'
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Savings goal'
  const current = Number(input.current_amount)

  const { data, error } = await ctx.supabase
    .from('savings_goals')
    .insert({
      wallet_id: ctx.walletId,
      name,
      target_amount_minor: Math.round(target * 100),
      current_amount_minor: isFinite(current) && current > 0 ? Math.round(current * 100) : 0,
      target_date: typeof input.target_date === 'string' ? input.target_date : null,
    })
    .select('id')
    .single()
  if (error) return `Failed to create goal: ${error.message}`
  if (data?.id) ctx.createdIds.goal = data.id
  return `Created the goal "${name}" targeting ${fmt(Math.round(target * 100), ctx.symbol)}.`
}

async function handleCreateCategory(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) return 'A category needs a name.'

  const { data, error } = await ctx.supabase
    .from('categories')
    .insert({
      wallet_id: ctx.walletId,
      name,
      icon: typeof input.icon === 'string' ? input.icon : null,
    })
    .select('id')
    .single()
  if (error) return `Failed to create category: ${error.message}`
  if (data?.id) ctx.createdIds.category = data.id
  return `Created the category "${name}".`
}

const MEMORY_KINDS = new Set(['note', 'mood', 'preference', 'fact'])

async function handleSaveMemory(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const kind = MEMORY_KINDS.has(String(input.kind)) ? String(input.kind) : 'note'
  const content = typeof input.content === 'string' ? input.content.trim() : ''
  if (!content) return 'A memory needs some content to save.'
  const mood = typeof input.mood === 'string' && input.mood.trim() ? input.mood.trim() : null

  const { data, error } = await ctx.supabase
    .from('ai_memories')
    .insert({
      user_id: ctx.userId,
      wallet_id: ctx.walletId,
      kind,
      content,
      mood,
    })
    .select('id')
    .single()
  if (error) return `Failed to save that memory: ${error.message}`
  if (data?.id) ctx.createdIds.memory = data.id
  return `Remembered: ${content}`
}

async function handleTeachCategorization(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const matchValue = typeof input.match_value === 'string' ? input.match_value.trim() : ''
  const categoryName = typeof input.category === 'string' ? input.category.trim() : ''
  if (!matchValue) return 'I need a merchant or phrase to learn.'
  if (!categoryName) return 'I need a category name to teach.'
  const category = ctx.categories.find((c) => c.name.toLowerCase() === categoryName.toLowerCase())
  if (!category) return `No category named "${categoryName}". Create it first or pick an existing one.`

  const matchType = input.match_type === 'description_contains' ? 'description_contains' : 'merchant_contains'
  const { data: existing, error: selectError } = await ctx.supabase
    .from('categorization_rules')
    .select('id')
    .eq('wallet_id', ctx.walletId)
    .eq('match_type', matchType)
    .eq('match_value', matchValue)
    .maybeSingle()
  if (selectError) return `Failed to save that rule: ${selectError.message}`

  if (existing) {
    const { error } = await ctx.supabase
      .from('categorization_rules')
      .update({ category_id: category.id })
      .eq('id', existing.id)
    if (error) return `Failed to save that rule: ${error.message}`
  } else {
    const { error } = await ctx.supabase.from('categorization_rules').insert({
      wallet_id: ctx.walletId,
      match_type: matchType,
      match_value: matchValue,
      category_id: category.id,
    })
    if (error) return `Failed to save that rule: ${error.message}`
  }
  return `I'll categorize "${matchValue}" as ${category.name} from now on.`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
