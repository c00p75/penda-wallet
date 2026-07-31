import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Database, Json } from '../_shared/database.types.ts'
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
  resolvePersonality,
} from '../_shared/personas.ts'
import {
  loadConsentAndTrust,
  mayAutoApplyMutation,
  patchIsHighImpact,
  createPatchIsHighImpact,
  normalizeAiConsent,
  normalizeAiTrust,
  persistTrustAfterConfirm,
  type AiConsent,
  type AiTrust,
} from '../_shared/aiTrust.ts'
import { findCategory } from '../_shared/categories.ts'
import { DEBT_PAYMENT_CATEGORY_NAME } from '../_shared/debtPaymentCategory.ts'
import { executePendingAction } from '../_shared/executePendingAction.ts'
import {
  computeAccountBalanceMinor,
  computeWalletBalanceMinor,
  defaultAccountId,
} from '../_shared/walletBalance.ts'
import {
  formatMilestoneSuggestionsForPrompt,
  suggestMilestones,
  type MilestoneSuggestion,
} from '../_shared/suggestMilestones.ts'
import { convertCurrency } from '../_shared/currencyConvert.ts'

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

interface UiEdit {
  domain: string
  summary: string
}

const UI_EDIT_DOMAINS = new Set([
  'transaction',
  'budget',
  'debt',
  'goal',
  'recurring',
  'pact',
  'category',
])

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
  'radar',
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

/** Edits the user made in the app UI (View sheet) since the last model turn. */
function sanitizeUiEdits(raw: unknown): UiEdit[] {
  if (!Array.isArray(raw)) return []
  const out: UiEdit[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const domain = (item as { domain?: unknown }).domain
    const summary = (item as { summary?: unknown }).summary
    if (typeof domain !== 'string' || !UI_EDIT_DOMAINS.has(domain)) continue
    if (typeof summary !== 'string') continue
    const cleaned = summary.trim().slice(0, 200)
    if (!cleaned) continue
    out.push({ domain, summary: cleaned })
    if (out.length >= 20) break
  }
  return out
}

interface ChatRequestBody {
  walletId: string
  conversationId?: string
  message: string
  pageContext?: PageContext
  /** Records the user changed in the View editor during this chat. */
  uiEdits?: UiEdit[]
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

// Provider-agnostic message shape, persisted to the DB and adapted to each
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

// A staged create/update/delete/reconcile surfaced to the client as a Yes/Cancel
// card. The tool layer NEVER executes these; confirm-ai-action does, on an
// explicit user tap.
interface PendingAction {
  id: string
  kind: 'create' | 'update' | 'delete' | 'reconcile'
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
  /** The row this step's `domain` names, which is what View opens. */
  targetId?: string
  /**
   * The wallet entry, when a step saved one alongside its main record (borrowing
   * and lending write a transaction plus a debt). Undo needs both.
   */
  transactionId?: string
  details?: Record<string, string>
}

// Everything a tool handler needs, so handlers take one ctx instead of a long
// argument list. pendingActions is mutated in place by the staging handlers.
interface PocketAccount {
  id: string
  name: string
  kind: string
  is_default: boolean
}

interface AccountKind {
  id: string
  name: string
}

interface ToolContext {
  supabase: SupabaseClient
  walletId: string
  userId: string
  conversationId: string
  currency: string
  symbol: string
  categories: Category[]
  accounts: PocketAccount[]
  kinds: AccountKind[]
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

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
    // hit the model before doing any LLM work. Fails open on a DB hiccup , 
    // see checkRateLimits, so a broken limiter never takes down chat itself.
    const limitMessage = await checkRateLimits(supabase, user.id, 'chat-message', CHAT_RATE_LIMITS)
    if (limitMessage) {
      return respond({ error: limitMessage }, 429)
    }

    const body = (await req.json()) as ChatRequestBody
    if (!body.walletId || !body.message) {
      return respond({ error: 'walletId and message are required' }, 400)
    }
    // walletId is interpolated into PostgREST .or() filters (categories,
    // query_records). RLS bounds the blast radius, but reject non-UUIDs at
    // the door like sanitizePageContext already does for entityId.
    if (!UUID_RE.test(body.walletId)) {
      return respond({ error: 'walletId must be a UUID' }, 400)
    }
    if (body.conversationId != null && !UUID_RE.test(body.conversationId)) {
      return respond({ error: 'conversationId must be a UUID' }, 400)
    }

    const conversationId = await getOrCreateConversation(supabase, user.id, body.walletId, body.conversationId)
    // History needs the conversation id; the rest are independent reads, fan out.
    const [history, categories, accounts, kinds, rules, profile, memories, currency] = await Promise.all([
      fetchHistory(supabase, conversationId),
      fetchCategories(supabase, body.walletId),
      fetchAccounts(supabase, body.walletId),
      fetchAccountKinds(supabase, body.walletId),
      fetchCategorizationRules(supabase, body.walletId),
      fetchProfile(supabase, user.id),
      fetchMemories(supabase, user.id),
      fetchWalletCurrency(supabase, body.walletId),
    ])
    const milestoneSuggestions = await fetchMilestoneSuggestions(supabase, body.walletId, profile)

    const pageContext = sanitizePageContext(body.pageContext)
    const uiEdits = sanitizeUiEdits(body.uiEdits)
    const systemInstruction = buildSystemInstruction(
      profile,
      currency,
      memories,
      pageContext,
      {
        continuityEnabled: true,
        uiEdits,
      },
      milestoneSuggestions,
    )

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
      accounts,
      kinds,
      rules,
      createdTransaction: null,
      pendingActions: [],
      completedActions: [],
      createdIds: {},
      autoApplied: false,
    }

    // Progress channel for the chat UI, subscribed lazily on the FIRST tool
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
          // Out of wall-clock budget, stop starting new model calls and fall
          // through to the "try rephrasing" reply rather than risk a gateway
          // timeout with nothing persisted for the client to show.
          if (iteration > 0 && Date.now() - turnStart > TURN_BUDGET_MS) break

          // Rebuilt per iteration because the category enum is baked into the
          // schema: create_category mid-turn has to widen it, or the model can't
          // name the category it just made on the follow-up call.
          const tools = buildTools(ctx.categories, ctx.accounts, ctx.kinds)
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

          // Partial narration before tools isn't the final reply, clear the bubble.
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
              // Log only the message, never the raw error object, it can carry
              // row data (e.g. a Postgres constraint error echoing values).
              console.error(`Tool ${call.name} threw:`, err instanceof Error ? err.message : String(err))
              summary = `Tool "${call.name}" failed: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was saved for this step. Do not claim it succeeded.`
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
        reply: "Sorry, I'm having trouble completing that one. Could you try rephrasing?",
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
            send('error', { error: 'Something went wrong on our side. Please try again.' })
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
    return respond({ error: 'Something went wrong on our side. Please try again.' }, 500)
  }
})

// --- Model orchestration -----------------------------------------------

// Bounds the worst case of a hung upstream call, without this, a stalled
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
  // instead, dispatchTool's default branch handles an empty/unknown name.
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
  supabase: SupabaseClient<Database>,
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
      // Stale session, fall through to insert a fresh conversation.
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

async function fetchHistory(supabase: SupabaseClient<Database>, conversationId: string): Promise<NeutralMessage[]> {
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
  // and breaks the provider call, drop leading messages until a plain user text.
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

async function insertMessage(supabase: SupabaseClient<Database>, conversationId: string, message: NeutralMessage) {
  const { error } = await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, role: message.role, content: message.parts as unknown as Json })
  if (error) throw error
}

async function fetchCategories(supabase: SupabaseClient<Database>, walletId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .or(`wallet_id.eq.${walletId},wallet_id.is.null`)
  if (error) throw error
  return data ?? []
}

async function fetchAccounts(supabase: SupabaseClient<Database>, walletId: string): Promise<PocketAccount[]> {
  // accounts.kind was dropped for kind_id (see migration 0062); embed the
  // lookup table to keep PocketAccount's flat name shape.
  const { data, error } = await supabase
    .from('accounts')
    .select('id, name, kind:account_kinds(name), is_default')
    .eq('wallet_id', walletId)
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
  if (error) throw error
  // No intermediate cast: mapping straight off the inferred row shape means a
  // future select() typo (like the kind one this replaced) fails deno check
  // instead of 500ing every chat turn in production.
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind?.name ?? 'Other',
    is_default: row.is_default,
  }))
}

async function fetchAccountKinds(supabase: SupabaseClient<Database>, walletId: string): Promise<AccountKind[]> {
  const { data, error } = await supabase
    .from('account_kinds')
    .select('id, name')
    .eq('wallet_id', walletId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

function resolveAccountId(
  accounts: PocketAccount[],
  raw: unknown,
  fallbackId: string | null,
): string | null {
  if (typeof raw === 'string' && raw.trim()) {
    const wanted = raw.trim().toLowerCase()
    const hit =
      accounts.find((a) => a.id === raw) ??
      accounts.find((a) => a.name.toLowerCase() === wanted) ??
      accounts.find((a) => a.name.toLowerCase().includes(wanted))
    if (hit) return hit.id
  }
  return fallbackId ?? accounts.find((a) => a.is_default)?.id ?? accounts[0]?.id ?? null
}

async function fetchCategorizationRules(supabase: SupabaseClient<Database>, walletId: string): Promise<CategorizationRule[]> {
  const { data, error } = await supabase
    .from('categorization_rules')
    .select('match_type, match_value, category_id')
    .eq('wallet_id', walletId)
  if (error) throw error
  // match_type is a DB check-constrained text column (not a Postgres enum),
  // so generated types widen it to string; narrow it back per the constraint.
  return (data ?? []).map((row) => ({ ...row, match_type: row.match_type as CategorizationRule['match_type'] }))
}

interface ChatLifeEvent {
  kind: string
  label: string
  starts_on: string
  ends_on: string | null
}

interface ChatProfile {
  personality: string
  mode: string
  primaryGoals: string[]
  householdSize: number | null
  incomeRange: string | null
  gender: string
  /** Active life-event season when present; null otherwise. */
  lifeEvent: ChatLifeEvent | null
}

function normalizeLifeEvent(raw: unknown, today: string): ChatLifeEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const kind = o.kind
  if (
    kind !== 'travel' &&
    kind !== 'job_change' &&
    kind !== 'newborn' &&
    kind !== 'wedding' &&
    kind !== 'other'
  ) {
    return null
  }
  if (typeof o.label !== 'string' || typeof o.starts_on !== 'string') return null
  if (o.starts_on > today) return null
  if (typeof o.ends_on === 'string' && o.ends_on < today) return null
  return {
    kind,
    label: o.label,
    starts_on: o.starts_on,
    ends_on: typeof o.ends_on === 'string' ? o.ends_on : null,
  }
}

function lifeEventPromptLine(event: ChatLifeEvent): string {
  switch (event.kind) {
    case 'travel':
      return `They are in a travel season (${event.label}). Frame coaching around keeping home bills covered while fun lives in a trip envelope.`
    case 'job_change':
      return `They are in a job-change season (${event.label}). Prefer buffer-first guidance before new lifestyle spend.`
    case 'newborn':
      return `They are in a newborn season (${event.label}). Protect essentials; soft-pedal lifestyle spend.`
    case 'wedding':
      return `They are in a wedding window (${event.label}). Prefer one clear celebration goal over scattered little expenses.`
    default:
      return `They marked a life moment (${event.label}). Coach a bit softer on lifestyle spend until it clears.`
  }
}

async function fetchProfile(supabase: SupabaseClient<Database>, userId: string): Promise<ChatProfile> {
  const { data } = await supabase
    .from('profiles')
    .select(
      'ai_personality, mode, primary_goal, primary_goals, household_size, income_range, gender, life_event',
    )
    .eq('id', userId)
    .maybeSingle()
  return {
    personality: data?.ai_personality ?? 'balanced_coach',
    mode: data?.mode ?? 'individual',
    primaryGoals: normalizeGoals(data?.primary_goals, data?.primary_goal),
    householdSize: data?.household_size ?? null,
    incomeRange: data?.income_range ?? null,
    gender: data?.gender ?? 'prefer_not_to_say',
    lifeEvent: normalizeLifeEvent(data?.life_event, today()),
  }
}

/** Load spend / goals / debts signals and rank life-milestone suggestions for the prompt. */
async function fetchMilestoneSuggestions(
  supabase: SupabaseClient<Database>,
  walletId: string,
  profile: ChatProfile,
): Promise<MilestoneSuggestion[]> {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 3)
  const since = cutoff.toISOString().slice(0, 10)

  const [goalsRes, debtsRes, txRes] = await Promise.all([
    supabase
      .from('savings_goals')
      .select('name')
      .eq('wallet_id', walletId)
      .is('archived_at', null),
    supabase
      .from('debts')
      .select('id, balance_minor')
      .eq('wallet_id', walletId)
      .is('archived_at', null)
      .gt('balance_minor', 0)
      .limit(5),
    supabase
      .from('transactions')
      .select('amount_minor, type, merchant, description, category:categories(name)')
      .eq('wallet_id', walletId)
      .eq('type', 'expense')
      .gte('transaction_date', since)
      .is('deleted_at', null)
      .limit(200),
  ])

  const categoryTotals = new Map<string, number>()
  const textParts: string[] = []
  for (const row of txRes.data ?? []) {
    const cat = row.category as { name?: string } | null
    const name = cat?.name
    if (name) {
      categoryTotals.set(name, (categoryTotals.get(name) ?? 0) + Math.abs(Number(row.amount_minor) || 0))
    }
    if (typeof row.merchant === 'string' && row.merchant) textParts.push(row.merchant)
    if (typeof row.description === 'string' && row.description) textParts.push(row.description)
  }

  return suggestMilestones({
    mode: profile.mode,
    primaryGoals: profile.primaryGoals,
    householdSize: profile.householdSize,
    incomeRange: profile.incomeRange,
    lifeEventKind: profile.lifeEvent?.kind ?? null,
    existingGoalNames: (goalsRes.data ?? []).map((g) => g.name).filter(Boolean),
    categorySpend: [...categoryTotals.entries()].map(([categoryName, totalMinor]) => ({
      categoryName,
      totalMinor,
    })),
    textBlob: textParts.join(' ').toLowerCase(),
    hasOpenDebt: (debtsRes.data ?? []).length > 0,
    max: 4,
  })
}

/** Prefer the multi-goal array; fall back to the legacy single goal column. */
function normalizeGoals(goals: unknown, legacy: string | null | undefined): string[] {
  if (Array.isArray(goals)) return goals.filter((g): g is string => typeof g === 'string')
  return legacy ? [legacy] : []
}

/** "a", "a and b", "a, b, and c" */
function joinGoalPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? ''
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`
}

// Onboarding-collected context, woven into the system prompt. The gender line
// is a hard requirement, not a suggestion: it may only ever shape tone, never
// financial advice, calculations, or any other logic, see migration
// 0029_onboarding_profile_fields.sql.
function buildUserContextSection(profile: ChatProfile): string {
  const lines: string[] = []

  const goalPhrases = profile.primaryGoals.map((g) => GOAL_LABELS[g]).filter(Boolean)
  if (goalPhrases.length > 0) {
    const isPlural = goalPhrases.length > 1
    lines.push(
      `Their stated primary financial ${isPlural ? 'goals' : 'goal'} right now ${
        isPlural ? 'are' : 'is'
      } to ${joinGoalPhrases(goalPhrases)}. Where relevant, connect your guidance back to ${
        isPlural ? 'these' : 'this'
      } without being repetitive about it.`,
    )
  }

  if (profile.householdSize && profile.mode !== 'individual') {
    const noun = profile.mode === 'business' ? 'team' : 'household'
    lines.push(`They are managing money for a ${noun} of ${profile.householdSize} people.`)
  }

  if (profile.incomeRange && INCOME_RANGE_LABELS[profile.incomeRange]) {
    lines.push(
      `They describe their financial situation as "${INCOME_RANGE_LABELS[profile.incomeRange]}", a qualitative ` +
        'band, not an exact figure. Never ask for or assume a specific income number from this alone.',
    )
  }

  if (profile.lifeEvent) {
    lines.push(lifeEventPromptLine(profile.lifeEvent))
  }

  if (profile.gender !== 'prefer_not_to_say' && GENDER_LABELS[profile.gender]) {
    lines.push(
      `The user identifies as ${GENDER_LABELS[profile.gender]}. Use this ONLY to make tone and phrasing feel ` +
        'natural, it must NEVER influence financial advice, calculations, risk framing, or any other logic. ' +
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
// unbounded, the prompt only needs enough context to feel like Penda
// remembers, not a full transcript. Durable kinds (preference/fact) are
// prioritized over recency: a long-lived "never guilt-trip fast food"
// preference must not get pushed out of the window by a burst of recent mood
// notes (audit finding).
const MAX_MEMORIES_IN_PROMPT = 20
const MAX_DURABLE_MEMORIES = 12
const MEMORY_FETCH_WINDOW = 60

async function fetchMemories(supabase: SupabaseClient<Database>, userId: string): Promise<Memory[]> {
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

async function fetchWalletCurrency(supabase: SupabaseClient<Database>, walletId: string): Promise<string> {
  const { data } = await supabase.from('wallets').select('base_currency').eq('id', walletId).maybeSingle()
  return data?.base_currency ?? 'USD'
}

function recentMoodTone(
  memories: Memory[],
): 'stressed' | 'low' | 'ok' | 'up' | null {
  const recent = memories.filter((m) => m.kind === 'mood').slice(0, 5)
  if (recent.length === 0) return null
  for (const m of recent) {
    const label = (m.mood ?? '').toLowerCase()
    if (['stressed', 'anxious', 'worried'].includes(label)) return 'stressed'
    if (['sad', 'low', 'tired', 'down'].includes(label)) return 'low'
    if (['happy', 'great', 'excited', 'proud'].includes(label)) return 'up'
    const text = `${m.mood ?? ''} ${m.content}`
    if (/\b(stress|anxious|overwhelm|worried)\b/i.test(text)) return 'stressed'
    if (/\b(sad|tired|drained|low)\b/i.test(text)) return 'low'
  }
  return 'ok'
}

function moodPromptFragment(tone: 'stressed' | 'low' | 'ok' | 'up' | null): string {
  if (!tone || tone === 'ok') return ''
  if (tone === 'up') {
    return `\nThe user has been feeling upbeat lately. Celebrate wins briefly; it's fine to lean into goals.`
  }
  if (tone === 'stressed') {
    return `\nThe user has been feeling stressed about money. Prefer reassurance over alerts. Only suggest parking or buffering money when tools show cash remains. Ask fewer questions. Never guilt-trip.`
  }
  return `\nThe user has been feeling low. Keep replies short and kind. Skip optional tips unless they ask.`
}

function buildSystemInstruction(
  profile: ChatProfile,
  currency: string,
  memories: Memory[],
  pageContext?: PageContext,
  opts?: { continuityEnabled?: boolean; uiEdits?: UiEdit[] },
  milestoneSuggestions: MilestoneSuggestion[] = [],
): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency
  const personality = resolvePersonality(profile.personality)
  const personaName = PERSONALITY_NAMES[personality] ?? PERSONALITY_NAMES.balanced_coach
  const moodTone = recentMoodTone(memories)
  const screenLine = pageContext
    ? pageContext.entityId
      ? `The user is currently on the ${pageContext.page} page viewing record ${pageContext.entityId}; "this"/"it" likely refers to that record.\n\n`
      : `The user is currently on the ${pageContext.page} page.\n\n`
    : ''
  const uiEdits = opts?.uiEdits ?? []
  const uiEditsLine =
    uiEdits.length > 0
      ? `Since your last reply, the user edited these records in the app UI (View editor), not via your tools:\n` +
        uiEdits.map((e) => `- (${e.domain}) ${e.summary}`).join('\n') +
        `\nAny earlier query_records or totals for those domains in this chat are STALE. You MUST call ` +
        `query_records again before answering about them. Acknowledge the update briefly if relevant.\n\n`
      : ''
  const milestoneBlock = formatMilestoneSuggestionsForPrompt(milestoneSuggestions)
  const houseRules = `You are ${personaName}, an AI assistant persona embedded in Penda, a personal finance
app. Penda is the app you live in, not your name. Always introduce and refer to yourself as
${personaName}, never as "Penda". Your job in this conversation is to help the user log
transactions by talking naturally. You are not a generic chatbot; you are the primary way this
user records spending and income.

Never use the em dash character (—) in replies or tool summaries. Prefer a period, comma, or colon.

Before suggesting parking, saving, buffering, or splitting a cash-in, confirm remaining funds with
tools (balance / recent income vs later spend). If the wallet is negative or that cash is already
spent, say so and offer a catch-up plan instead of an allocate/park nudge.
${moodPromptFragment(moodTone)}
${MODE_AI_CONTEXT[profile.mode] ?? MODE_AI_CONTEXT.individual}${buildUserContextSection(profile)}${milestoneBlock}
This wallet's currency is ${currency} (${symbol}). When logging transactions, setting balances, or
stating wallet totals, use ${currency} and write amounts with "${symbol}" (e.g. ${symbol}12,
${symbol}2000). For ordinary logging the user types plain numbers in ${currency}.

When the user asks about another currency (exchange rates, "what's 12 dollars in kwacha", "convert
500 ZMW to USD"), call convert_currency with ISO codes and quote BOTH currencies from the tool
result. Never invent or guess an exchange rate. Still log wallet entries only in ${currency}; if
they want to record a foreign-currency spend, convert first, then log the ${currency} amount.

Life-milestone planning: when the user wants a plan or budget around a big life goal, asks what
they should save for, or names something like moving out, buying a car, a bigger home, starting
a business, school fees, a wedding, a baby, or a trip, treat that as milestone planning.
Offer 2–4 concrete milestones grounded in the ideas above (or ask one clarifying question if
signals conflict). When they pick one, stage create_goal with a clear name, target_amount, optional
target_date, and a fitting icon/motivation. Then help pace it: monthly save amount, what to trim,
and how it fits budgets / safe-to-spend. Do not invent target amounts without asking or estimating
from income facts they saved in memory.

If the user seems mid-flow or says they're busy, do NOT block them with clarifying questions.
Note the question briefly ("I'll ask later: …") and finish the current logging first. You can
revisit deferred questions once they're free.

When a categorization rule auto-applies, briefly teach-back: "Logged as X per your rule. Still
right?" so the user can correct lasting mistakes.

When the user describes a purchase, payment, or income (e.g. "I spent 12 on coffee at Blue Bottle",
"got paid 2000"), call the create_transaction tool with your best judgment for amount, type,
category, merchant, and date. If they name a pocket anywhere in the sentence, in phrasing like
"into Airtel Money", "from my Cash", "on my MTN MoMo", "via", or "with", set account to that exact
pocket name, it does not have to be the first or last word. Only omit account when no pocket is
named, so it defaults to the default pocket.

When the user tells you their actual current balance or total, what they HAVE right now rather than
a single transaction (e.g. "my balance is 1200", "I have about 350 in mobile money", "roughly 5k in
total"), call set_balance with that number. Do NOT log it as an income transaction: set_balance
reconciles the running total to reality and posts any balancing entry for you. If they name a pocket
(e.g. "I have about 350 in mobile money" -> account "MTN MoMo" or whichever pocket that is), set
account to that pocket so only it gets reconciled. Only omit account when they mean their whole
money account total, since omitting it reconciles everything, not just one pocket.

If a balance message names a source that is NOT already one of their pockets (e.g. "K134 in Airtel
Money, K577 in Zanaco Bank, K7 cash" when only Cash exists), call create_pocket once per new source
instead of set_balance, passing the stated amount as opening_balance. Only fall back to set_balance
for sources that already exist as a pocket.

Tell apart a payment that just happened from a description of their situation. "Got paid 2000" is a
real income event, log it with create_transaction. "I usually earn about 2000 a month" or "I get
paid on the 25th" is a durable fact, not a transaction: save it with save_memory (kind "fact") so
you can plan around their income and payday, and do NOT create a transaction for it.

Some messages imply more than one thing happened to the money, reason about what actually
happened and record all of it:
- Borrowing ("I borrowed K500 from Amara", "took a loan") or lending / being owed ("I lent Tich
  K200", "Tich owes me K200"): cash actually changed hands, so call log_borrowed_or_lent_money with
  direction "i_owe" for borrowing (wallet goes UP) or "owed_to_me" for lending (wallet goes DOWN).
  This logs the transaction and the debt together in one atomic step, never call create_transaction
  and create_debt separately for this, since if the second call failed after the first succeeded the
  ledger would be left half-updated with a transaction but no matching debt.
- If money was only promised and hasn't moved yet, record just the debt with create_debt.
Never record only one half of a two-sided event.
When logging a debt or loan, always pass due_date if the user mentioned one (any phrasing like
"due on 1/08/2026", "by Friday", "end of the month"). Convert to ISO YYYY-MM-DD. A due date lets
Penda remind them the day before and the day it's due. If they didn't mention one, leave it out;
do not invent a due date.

Repaying or settling a debt is its own action ("I paid K200 toward the Jumo loan", "settle the
loan", "I cleared my debt with Amara", "mark it paid off"): find the debt id with query_records,
then call log_debt_payment. Pass the amount paid, or omit amount to settle the full balance. This
is the ONLY correct way to pay down or clear a debt, it drops the balance and fills the card's
progress bar. Never settle a debt by editing its principal to 0 with update_record, and never
delete the debt to mark it paid: both leave the card wrong and lose the repayment history.

If you are genuinely unsure how to record something, the type is ambiguous, you can't tell whether
it's a debt, or no category fits, ask ONE short clarifying question instead of guessing or doing
nothing. A quick question beats a wrong entry or silence. (A merely uncertain amount is the
exception: make a reasonable call there and let the user correct it.)

You can also read, edit, and remove the user's data, not just create it:
- ANSWERING QUESTIONS ("what did I spend this week?", "how much do I owe Amara?", "show my
  budgets", "total of my budgets"): use query_records to look things up, or get_spending_summary
  for spending totals over a period. Never say you can't check, you can. Reads run immediately.
  When summing budgets or recurring rules, use the total the tool returns. Do not add amounts in
  your head, and always call query_records fresh rather than reusing an older list from this chat.
  If the user says they updated values in View / the editor / the app, or that your totals are wrong,
  call query_records immediately and prefer the fresh tool total. Do not defend older numbers from
  earlier in this chat.
  Currency questions ("what's 12 dollars in kwacha?", "convert 500 ZMW to USD"): call
  convert_currency. Never invent an exchange rate. Quote the tool's result, and note it is
  mid-market / approximate.
  - Budgets vs recurring bills are different:
  - create_budget = a spending CAP for a category (weekly/monthly envelope on the Plan Budgets tab).
  - create_recurring_transaction = rent, salary, subscriptions that POST on a schedule (Plan Recurring tab).
  If the user says "every month" about a bill/paycheck/subscription, use create_recurring_transaction.
  If they say "budget", "cap", or "limit", use create_budget.
- CREATING: create_transaction and create_category apply immediately. create_budget, create_goal,
  create_debt, create_recurring_transaction, and create_pact STAGE a confirmation card. When staged,
  ask them to confirm; do not say it is done until they tap Confirm.
- EDITING or DELETING something that already exists ("actually it was K15 not K10", "delete that
  duplicate", "rename the trip goal", "pause my Netflix recurring"): you MUST first find the exact
  record with query_records to get its id, then call update_record or delete_record with that id.
  NEVER create a new record to "fix" an old one. That leaves a duplicate.

RECATEGORIZING an existing entry ("put the dog food entry under a category called Pets", "move that
to Transport") is a two or three step job you must finish in the same turn, not stop halfway:
1. If the category doesn't exist yet, create_category (pick a fitting emoji icon).
2. query_records on domain "transaction" to get the entry's id. Query the TRANSACTION, not the
   category: a category you just created is already usable and needs no lookup.
3. update_record with domain "transaction", that id, and changes {category: "<the category name>"}.
Creating the category alone does NOT move the entry. You are not done until update_record is applied
or staged, so never end the turn after step 1 or 2.

Confirmation rules:
- create_transaction, create_category, and reads apply immediately.
- create_budget / create_goal / create_debt / create_recurring_transaction / create_pact,
  update_record, and set_balance stage a Yes/Cancel card (trusted users may get small ones
  auto-applied; large money amounts always need the card). If staged, phrase as a pending question
  (e.g. "Want me to add a K500 monthly Netflix bill?"). Do not say it's done until applied.
- delete_record ALWAYS needs a confirmation card, even for trusted users. Never say a delete is
  done until they confirm. Phrase as "Delete the K10 tea entry?"

After a create or read result comes back, reply with a short, natural confirmation or answer. Do not
restate every field back at the user like a receipt. Just confirm briefly in your own voice.

You have a memory across conversations (the Financial Journal): use save_memory when the user states
a preference ("I never want to see fast food guilt-tripped"), shares a fact worth recalling ("I freelance
on the side"), states a goal's real motivation, or reveals a behavioral pattern (e.g. "I stress-buy after
work", kind "mood" with a short mood label). Use it sparingly, for things genuinely worth recalling
later, not routine transaction chatter. Weave anything relevant from what you already remember (below)
into your replies naturally, don't just list it back.${buildMemorySection(memories)}`

  const personalityFragment = PERSONALITY_PROMPTS[personality] ?? PERSONALITY_PROMPTS.balanced_coach

  // Volatile context (current page, UI edits, today's date) goes LAST: everything
  // above it is stable across a user's requests, so Gemini's implicit prefix
  // caching can reuse it. With the page line mid-prompt, every navigation
  // invalidated the cached prefix from that point down (audit finding).
  return `${houseRules}\n\n${personalityFragment}\n\n${screenLine}${uiEditsLine}Today's date is ${today()}.`
}

function buildMemorySection(memories: Memory[]): string {
  if (memories.length === 0) return ''
  const lines = memories.map((m) => `- (${m.kind}${m.mood ? `: ${m.mood}` : ''}) ${m.content}`)
  return `\n\nWhat you remember about this user:\n${lines.join('\n')}`
}

function buildTools(categories: Category[], accounts: PocketAccount[], kinds: AccountKind[]): ToolDefinition[] {
  const categoryNames = categories.map((c) => c.name)
  const accountNames = accounts.map((a) => a.name)
  const kindNames = kinds.map((k) => k.name)

  return [
    {
      name: 'create_transaction',
      description:
        'Log a new expense or income in a pocket (Cash, Airtel Money, MTN, etc.) under the ' +
        'current money account. Prefer the matching pocket when the user names one or pastes MoMo.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['expense', 'income'] },
          amount: { type: 'number', description: 'Amount as a decimal number, e.g. 12.50' },
          category: { type: 'string', enum: categoryNames },
          account: {
            type: 'string',
            ...(accountNames.length > 0 ? { enum: accountNames } : {}),
            description:
              'Pocket name, e.g. "Cash", "Airtel Money", "MTN MoMo". Defaults to the default pocket.',
          },
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
      name: 'set_balance',
      description:
        'Record what the user ACTUALLY has right now. Prefer a pocket when they name one ' +
        '("my Airtel balance is 350"); omit account for the whole money-account total. ' +
        'ALWAYS stages a confirmation card. Do not say it\'s done until they confirm.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          amount: {
            type: 'number',
            description: 'The actual balance right now, as a decimal number, e.g. 1200 or 349.50.',
          },
          account: {
            type: 'string',
            ...(accountNames.length > 0 ? { enum: accountNames } : {}),
            description: 'Optional pocket name when reconciling one pocket, not the whole account.',
          },
        },
        required: ['amount'],
      },
    },
    {
      name: 'create_debt',
      description:
        'Propose a debt where money has NOT moved yet, just a promise or IOU with nothing exchanged. ' +
        'Stages a confirmation card. Use log_borrowed_or_lent_money instead whenever cash actually ' +
        'changed hands, so the wallet transaction and the debt save together atomically.',
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
          due_date: {
            type: 'string',
            description:
              'Optional ISO date YYYY-MM-DD when repayment is due. Pass whenever the user mentions a due date.',
          },
        },
        required: ['name', 'direction', 'amount'],
      },
    },
    {
      name: 'log_borrowed_or_lent_money',
      description:
        'Atomically record BOTH sides of borrowing or lending money, the wallet transaction AND the ' +
        'debt, in one step, so they save together or not at all. Use this INSTEAD of create_transaction ' +
        'plus create_debt whenever cash actually changes hands for a loan: borrowing (direction "i_owe", ' +
        'wallet goes up) or lending / being owed (direction "owed_to_me", wallet goes down). If money was ' +
        'only promised and hasn\'t moved yet, use create_debt alone instead. Pass due_date when mentioned.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['i_owe', 'owed_to_me'] },
          amount: { type: 'number', description: 'Amount as a decimal number, e.g. 500.' },
          name: { type: 'string', description: 'Short label for the debt, e.g. "Loan from Amara".' },
          counterparty: { type: 'string', description: 'Who the debt is with, if mentioned.' },
          category: { type: 'string', enum: categoryNames, description: 'Optional category for the transaction.' },
          due_date: {
            type: 'string',
            description:
              'Optional ISO date YYYY-MM-DD when the debt is due. Pass whenever the user mentions a due date.',
          },
          transaction_date: {
            type: 'string',
            description: 'ISO date YYYY-MM-DD the money moved. Use today unless the user specifies otherwise.',
          },
        },
        required: ['direction', 'amount', 'name'],
      },
    },
    {
      name: 'log_debt_payment',
      description:
        'Record a repayment against an existing debt/loan: money the user paid toward what they owe, ' +
        'or a repayment they received on money owed to them. This is what "I paid 200 toward the Jumo ' +
        'loan", "settle the loan", "I cleared my debt with Amara", or "mark it paid off" mean. It logs ' +
        'a payment so the debt balance drops and the card\'s progress bar fills, exactly like tapping ' +
        '"Log a payment" on the debt. Find the debt id first with query_records. To settle a debt in ' +
        'full, omit amount and the entire outstanding balance is paid. Also posts a linked transaction ' +
        'to the pocket the money moved through, so that pocket\'s balance actually reflects the payment. ' +
        'If they name a pocket ("via Mobile Money", "from my Cash"), set account to it; otherwise it ' +
        'falls back to the default pocket, same as leaving the pocket picker on its default in the app. ' +
        'Runs immediately. This is the ONLY correct way to pay down or settle a debt: never edit the ' +
        'principal with update_record and never delete the debt to mark it paid.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The debt id from query_records.' },
          amount: {
            type: 'number',
            description:
              'Payment amount as a decimal, e.g. 200. Omit to settle the full outstanding balance.',
          },
          account: {
            type: 'string',
            ...(accountNames.length > 0 ? { enum: accountNames } : {}),
            description:
              'Pocket the payment was paid from (i_owe) or received into (owed_to_me), e.g. "Airtel ' +
              'Money". Omit if no pocket is mentioned; it defaults to the default pocket.',
          },
          paid_date: {
            type: 'string',
            description: 'ISO date YYYY-MM-DD the payment was made. Defaults to today.',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'create_budget',
      description:
        'Propose a spending budget (cap) for a category over a weekly, monthly, or custom date-range period. ' +
        'For period "custom", also pass start_date and end_date. ' +
        'Stages a confirmation card; do not say it is done until the user confirms.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Budget limit as a decimal, e.g. 500.' },
          period: { type: 'string', enum: ['weekly', 'monthly', 'custom'] },
          category: { type: 'string', enum: categoryNames, description: 'Category this budget caps.' },
          rollover: {
            type: 'boolean',
            description: 'Whether unused budget carries into the next period. Ignored for period "custom".',
          },
          start_date: {
            type: 'string',
            description: 'Date YYYY-MM-DD the custom range starts. Only used when period is "custom". Defaults to today.',
          },
          end_date: {
            type: 'string',
            description: 'Date YYYY-MM-DD the custom range ends. Required when period is "custom".',
          },
        },
        required: ['amount', 'period'],
      },
    },
    {
      name: 'create_goal',
      description:
        'Propose a savings goal or life milestone the user is working toward (move out, car, ' +
        'emergency buffer, school fees, wedding, trip, business kitty, etc.). Stages a ' +
        'confirmation card; do not say it is done until the user confirms.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'What the goal is, e.g. "Move out deposit" or "New laptop".',
          },
          target_amount: { type: 'number', description: 'Target amount to save, as a decimal.' },
          current_amount: { type: 'number', description: 'Amount already saved, if any. Defaults to 0.' },
          target_date: { type: 'string', description: 'Optional ISO date YYYY-MM-DD to hit the goal by.' },
          icon: {
            type: 'string',
            description: 'Optional emoji for the goal, e.g. "🏠", "🚗", "🛡️".',
          },
          motivation: {
            type: 'string',
            description: 'Optional short why this milestone matters to them.',
          },
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
      name: 'create_pocket',
      description:
        'Create a new money pocket (Cash, a bank account, a mobile money wallet, etc.) when the ' +
        'user names a source of money that is not already one of their pockets. Optionally set its ' +
        'opening balance in the same call if the user stated an amount for it. Stages a confirmation ' +
        'card; do not say it is done until the user confirms.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Pocket name, e.g. "Airtel Money" or "Zanaco Bank Account".' },
          kind: {
            type: 'string',
            enum: kindNames,
            description: "Closest matching pocket type from the wallet's existing types.",
          },
          opening_balance: {
            type: 'number',
            description: 'Amount currently held in this pocket, as a decimal, if the user stated one.',
          },
        },
        required: ['name', 'kind'],
      },
    },
    {
      name: 'create_recurring_transaction',
      description:
        'Create a recurring bill, subscription, or paycheck that posts on a schedule (Plan → Recurring). ' +
        'Not a budget cap. Use for rent, Netflix, salary, etc.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Amount as a decimal, e.g. 500.' },
          type: { type: 'string', enum: ['expense', 'income'] },
          frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'yearly'] },
          next_run_date: {
            type: 'string',
            description: 'ISO date YYYY-MM-DD of the next time this should post.',
          },
          category: { type: 'string', enum: categoryNames, description: 'Category for the recurring entry.' },
          merchant: { type: 'string', description: 'Optional merchant or payee, e.g. "Netflix".' },
          description: { type: 'string', description: 'Optional note.' },
        },
        required: ['amount', 'type', 'frequency', 'next_run_date'],
      },
    },
    {
      name: 'create_pact',
      description:
        'Create a commitment pact (e.g. "No takeout this week") that holds the user to a category ' +
        'restriction over a date window.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'What the user is committing to.' },
          category: { type: 'string', enum: categoryNames, description: 'Category to restrict, if any.' },
          start_date: { type: 'string', description: 'ISO date YYYY-MM-DD. Defaults to today.' },
          end_date: { type: 'string', description: 'ISO date YYYY-MM-DD when the pact ends.' },
        },
        required: ['description', 'end_date'],
      },
    },
    {
      name: 'query_records',
      description:
        'Look up the user\'s existing records to answer questions or to find the id of something the ' +
        'user wants to edit or delete. Returns each record WITH its id. For budgets and recurring, ' +
        'also returns a server-computed total. Always re-query rather than reusing an older list. ' +
        'Runs immediately.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: ['transaction', 'debt', 'budget', 'goal', 'category', 'recurring', 'pact'],
          },
          search: { type: 'string', description: 'Optional text to match on merchant/description/name.' },
          since: { type: 'string', description: 'Transactions only: ISO date lower bound (inclusive).' },
          until: { type: 'string', description: 'Transactions only: ISO date upper bound (inclusive).' },
          limit: { type: 'number', description: 'Max rows to return. Defaults to 10 (50 for budget/recurring).' },
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
      name: 'convert_currency',
      description:
        'Convert an amount between currencies using a live mid-market exchange rate. Use whenever the ' +
        'user asks what something is worth in another currency (e.g. "what\'s 12 dollars in kwacha", ' +
        '"convert 500 ZMW to USD", "how much is €20 in kwacha"). Pass ISO 4217 codes when possible ' +
        '(USD, ZMW, EUR, GBP, …); spoken names like "dollars" or "kwacha" also work. Do NOT guess ' +
        'rates yourself. Runs immediately.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Amount as a decimal number, e.g. 12 or 12.50.' },
          from_currency: {
            type: 'string',
            description: 'Source currency ISO code or common name, e.g. USD or dollars.',
          },
          to_currency: {
            type: 'string',
            description: 'Target currency ISO code or common name, e.g. ZMW or kwacha.',
          },
        },
        required: ['amount', 'from_currency', 'to_currency'],
      },
    },
    {
      name: 'update_record',
      description:
        'Edit an existing record. Usually stages a confirmation card; small edits may auto-apply for ' +
        'trusted users, but large amount changes always ask. Find the record id first with ' +
        'query_records. Editable fields by domain: transaction {amount, type, category, merchant, ' +
        'description, transaction_date}; debt {name, direction, counterparty, amount, due_date}; ' +
        'budget {amount, period, category, rollover}; goal {name, target_amount, current_amount, ' +
        'target_date, icon, motivation}; category {name, icon}; wallet {name}; recurring {amount, type, category, ' +
        'merchant, description, frequency, next_run_date, is_active}; pact {description, category, ' +
        'start_date, end_date}. Amounts are decimals; category is a name.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: ['transaction', 'debt', 'budget', 'goal', 'category', 'wallet', 'recurring', 'pact'],
          },
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
        'Propose deleting an existing record. ALWAYS stages a confirmation card (never auto-deletes, ' +
        'even for trusted users). Find the record id first with query_records. Deleting a wallet or ' +
        'bulk-deleting is not allowed.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          domain: {
            type: 'string',
            enum: ['transaction', 'debt', 'budget', 'goal', 'category', 'recurring', 'pact'],
          },
          id: { type: 'string', description: 'The record id from query_records.' },
        },
        required: ['domain', 'id'],
      },
    },
    {
      name: 'save_memory',
      description:
        'Save something worth remembering about the user for future conversations, a stated preference, ' +
        'a fact they shared, a goal\'s real motivation, or a noticed behavioral/emotional pattern (kind ' +
        '"mood", e.g. "stress-buys after work"). Runs immediately. Use sparingly, only for things ' +
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

// Tools that only stage Yes/Cancel cards (or fail). Successful stages have no
// trail "done" row; the pending card is the trail entry.
const STAGING_TOOLS = new Set([
  'update_record',
  'delete_record',
  'set_balance',
  'create_budget',
  'create_goal',
  'create_debt',
  'create_recurring_transaction',
  'create_pact',
])

const STAGING_FAILURE_LABELS: Record<string, string> = {
  update_record: 'Couldn’t update that',
  delete_record: 'Couldn’t delete that',
  set_balance: 'Couldn’t set the balance',
  create_budget: 'Couldn’t create that budget',
  create_goal: 'Couldn’t create that goal',
  create_debt: 'Couldn’t record that debt',
  create_recurring_transaction: 'Couldn’t create that recurring item',
  create_pact: 'Couldn’t create that pact',
}

const TOOL_TRAIL_META: Record<string, { domain: string; label: string }> = {
  create_transaction: { domain: 'transaction', label: 'Logged transaction' },
  create_debt: { domain: 'debt', label: 'Recorded debt' },
  log_borrowed_or_lent_money: { domain: 'debt', label: 'Recorded loan' },
  log_debt_payment: { domain: 'debt', label: 'Logged payment' },
  create_budget: { domain: 'budget', label: 'Created budget' },
  create_goal: { domain: 'goal', label: 'Created goal' },
  create_category: { domain: 'category', label: 'Created category' },
  create_recurring_transaction: { domain: 'recurring', label: 'Created recurring' },
  create_pact: { domain: 'pact', label: 'Created pact' },
  query_records: { domain: 'query', label: 'Looked that up' },
  get_spending_summary: { domain: 'summary', label: 'Tallied spend' },
  convert_currency: { domain: 'fx', label: 'Converted currency' },
  save_memory: { domain: 'memory', label: 'Remembered that' },
  teach_categorization: { domain: 'memory', label: 'Taught Penda' },
  money_habit: { domain: 'goal', label: 'Saved via habit' },
}

function toolFailed(result: string, threw: boolean): boolean {
  if (threw) return true
  return /^(Failed|Tool "|Amount must|Debt amount|Budget amount|Goal target|A balance|A category|A memory|I can't|I need|Nothing to|Unknown tool|Deleting )/i
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
  const meta = TOOL_TRAIL_META[call.name] ?? { domain: 'general', label: 'Did something' }
  const failed = toolFailed(result, threw)

  // A staged update/delete that succeeded already has its own confirm card, so
  // don't duplicate it. One that failed has no card anywhere, which made the
  // whole step vanish from the trail and read as if the agent never tried.
  if (STAGING_TOOLS.has(call.name)) {
    // "the values already match" is a no-op the reply explains, not a failure.
    if (!failed || result.startsWith('Nothing to')) return null
    return {
      id: call.id,
      tool: call.name,
      domain: typeof call.args.domain === 'string' ? call.args.domain : meta.domain,
      label: STAGING_FAILURE_LABELS[call.name] ?? 'Couldn’t do that',
      summary: 'Something went wrong',
      status: 'error',
    }
  }
  const args = call.args
  let label = meta.label
  let summary = result
  // Looked up by the row's own domain, so View can never be handed an id from a
  // different table (a borrow/lend row reads as a debt but also saves a
  // transaction, and it used to deep-link the transaction id as a debt).
  const targetId = ctx.createdIds[meta.domain]
  let transactionId: string | undefined
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
      break
    }
    case 'create_debt': {
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      const amount = Number(args.amount)
      const counterparty = typeof args.counterparty === 'string' ? args.counterparty.trim() : ''
      const dueDate = typeof args.due_date === 'string' ? args.due_date.trim() : ''
      summary = [name || 'Debt', Number.isFinite(amount) && amount > 0 ? fmtAmount(amount, ctx.symbol) : null]
        .filter(Boolean)
        .join(' · ')
      if (name) details.Name = name
      if (counterparty) details.With = counterparty
      if (Number.isFinite(amount) && amount > 0) details.Amount = fmtAmount(amount, ctx.symbol)
      if (dueDate) details.Due = dueDate
      break
    }
    case 'log_borrowed_or_lent_money': {
      const direction = args.direction === 'owed_to_me' ? 'Lent' : 'Borrowed'
      label = direction === 'Lent' ? 'Recorded lending' : 'Recorded borrowing'
      const amount = Number(args.amount)
      const counterparty = typeof args.counterparty === 'string' ? args.counterparty.trim() : ''
      const dueDate = typeof args.due_date === 'string' ? args.due_date.trim() : ''
      summary = [direction, counterparty || null, Number.isFinite(amount) && amount > 0 ? fmtAmount(amount, ctx.symbol) : null]
        .filter(Boolean)
        .join(' · ')
      if (counterparty) details.With = counterparty
      if (Number.isFinite(amount) && amount > 0) details.Amount = fmtAmount(amount, ctx.symbol)
      if (dueDate) details.Due = dueDate
      // targetId is the debt (this row's domain); the wallet entry saved with it
      // rides along so Undo can reverse both sides.
      transactionId = ctx.createdIds.transaction
      break
    }
    case 'log_debt_payment': {
      label = 'Logged payment'
      // summary already carries the handler's human sentence (amount + what's left).
      const amount = Number(args.amount)
      if (Number.isFinite(amount) && amount > 0) details.Amount = fmtAmount(amount, ctx.symbol)
      break
    }
    case 'create_budget': {
      const amount = Number(args.amount)
      const period = args.period === 'weekly' || args.period === 'custom' ? args.period : 'monthly'
      const category = typeof args.category === 'string' ? args.category.trim() : ''
      const periodLabel =
        period === 'custom' && typeof args.start_date === 'string' && typeof args.end_date === 'string'
          ? `${args.start_date} to ${args.end_date}`
          : period
      summary = [category || 'Budget', periodLabel, Number.isFinite(amount) && amount > 0 ? fmtAmount(amount, ctx.symbol) : null]
        .filter(Boolean)
        .join(' · ')
      if (category) details.Category = category
      details.Period = periodLabel
      if (Number.isFinite(amount) && amount > 0) details.Amount = fmtAmount(amount, ctx.symbol)
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
      break
    }
    case 'create_category': {
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      summary = name || (failed ? 'Couldn’t create category' : 'Category created')
      if (name) details.Name = name
      break
    }
    case 'create_pocket': {
      const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : 'Pocket'
      const opening = Number(args.opening_balance)
      label = 'Created pocket'
      summary = [name, Number.isFinite(opening) && opening > 0 ? fmtAmount(opening, ctx.symbol) : null]
        .filter(Boolean)
        .join(' · ')
      details.Name = name
      if (Number.isFinite(opening) && opening > 0) details.Balance = fmtAmount(opening, ctx.symbol)
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
    case 'convert_currency': {
      label = failed ? 'Couldn’t convert' : 'Converted currency'
      // Prefer the tool's readable line; keep the trail short.
      const approx = result.split(' (mid-market')[0]?.trim()
      summary = failed
        ? result.length > 100
          ? `${result.slice(0, 97)}…`
          : result
        : approx && approx.length <= 100
          ? approx
          : result.length > 100
            ? `${result.slice(0, 97)}…`
            : result
      const amount = Number(args.amount)
      if (Number.isFinite(amount) && amount > 0) details.Amount = String(amount)
      if (typeof args.from_currency === 'string') details.From = args.from_currency
      if (typeof args.to_currency === 'string') details.To = args.to_currency
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
    transactionId,
    details: Object.keys(details).length ? details : undefined,
  }
}

// --- Tool dispatch ---------------------------------------------------------

// Keyed by domain so the trail can look an id up by the domain it displays; see
// buildCompletedAction.
function rememberCreatedTransaction(ctx: ToolContext, tx: Record<string, unknown> | null): void {
  ctx.createdTransaction = tx
  // Cleared on failure too, so a step that saved nothing can't inherit the id of
  // an earlier step in the same turn.
  ctx.createdIds.transaction = tx && typeof tx.id === 'string' ? tx.id : undefined
}

async function dispatchTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'create_transaction': {
      const result = await handleCreateTransaction(
        ctx.supabase,
        ctx.walletId,
        ctx.userId,
        ctx.currency,
        ctx.categories,
        ctx.accounts,
        ctx.rules,
        args,
      )
      rememberCreatedTransaction(ctx, result.transaction)
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
    case 'set_balance':
      return await stageSetBalance(ctx, args)
    case 'create_debt':
      return await stageCreateDebt(ctx, args)
    case 'log_borrowed_or_lent_money': {
      const result = await handleLogBorrowOrLend(ctx, args)
      rememberCreatedTransaction(ctx, result.transaction)
      if (result.debtId) ctx.createdIds.debt = result.debtId
      return result.summary
    }
    case 'log_debt_payment': {
      const result = await handleLogDebtPayment(ctx, args)
      if (result.debtId) ctx.createdIds.debt = result.debtId
      return result.summary
    }
    case 'create_budget':
      return await stageCreateBudget(ctx, args)
    case 'create_goal':
      return await stageCreateGoal(ctx, args)
    case 'create_pocket':
      return await stageCreatePocket(ctx, args)
    case 'create_category':
      return await handleCreateCategory(ctx, args)
    case 'create_recurring_transaction':
      return await stageCreateRecurring(ctx, args)
    case 'create_pact':
      return await stageCreatePact(ctx, args)
    case 'query_records':
      return await handleQueryRecords(ctx, args)
    case 'get_spending_summary':
      return await handleSpendingSummary(ctx, args)
    case 'convert_currency':
      return await handleConvertCurrency(args)
    case 'update_record':
      return await stageUpdate(ctx, args)
    case 'delete_record':
      return await stageDelete(ctx, args)
    case 'save_memory':
      return await handleSaveMemory(ctx, args)
    case 'teach_categorization':
      return await handleTeachCategorization(ctx, args)
    default:
      return `Unknown tool "${name}", no action taken.`
  }
}

async function handleCreateTransaction(
  supabase: SupabaseClient<Database>,
  walletId: string,
  userId: string,
  currency: string,
  categories: Category[],
  accounts: PocketAccount[],
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
  const type = input.type === 'income' ? 'income' : 'expense'
  const transactionDate = typeof input.transaction_date === 'string' ? input.transaction_date : today()

  let categoryId = findCategory(categories, input.category)?.id ?? null
  let matchedRule: CategorizationRule | null = null
  for (const rule of rules) {
    const haystack = (rule.match_type === 'merchant_contains' ? merchant : description) ?? ''
    if (haystack.toLowerCase().includes(rule.match_value.toLowerCase())) {
      categoryId = rule.category_id
      matchedRule = rule
      break
    }
  }

  const fallbackAccount = await defaultAccountId(supabase, walletId)
  const accountId = resolveAccountId(accounts, input.account, fallbackAccount)

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      wallet_id: walletId,
      created_by: userId,
      account_id: accountId,
      category_id: categoryId,
      amount_minor: Math.round(amount * 100),
      currency,
      type,
      merchant,
      description,
      transaction_date: transactionDate,
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

  let summary = `Saved: ${JSON.stringify(data)}`
  if (matchedRule) {
    const catName =
      (data.category as { name?: string } | null)?.name ??
      categories.find((c) => c.id === matchedRule!.category_id)?.name ??
      'that category'
    summary += ` TEACH_BACK: Logged as ${catName} per your "${matchedRule.match_value}" rule. Still right?`
  }

  return { transaction: data, summary, habits }
}

// The "my balance is X" trust anchor. Stages a confirmation card; on confirm,
// executePendingAction's reconcile branch posts a single balancing entry for
// any gap between what the user says they have and Penda's running total, so
// safe-to-spend and everything downstream stays honest.
async function stageSetBalance(ctx: ToolContext, args: Record<string, unknown>): Promise<string> {
  const amount = Number(args.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    return 'A balance must be a number that is zero or more.'
  }
  const actualMinor = Math.round(amount * 100)
  const accountId =
    args.account != null ? resolveAccountId(ctx.accounts, args.account, null) : null
  const pocket = accountId ? ctx.accounts.find((a) => a.id === accountId) : null
  // Whole-account reconcile posts the balancing entry on the default pocket.
  const patchAccountId = accountId ?? (await defaultAccountId(ctx.supabase, ctx.walletId))

  const computedMinor = accountId
    ? await computeAccountBalanceMinor(ctx.supabase, accountId)
    : await computeWalletBalanceMinor(ctx.supabase, ctx.walletId)
  const where = pocket ? ` on ${pocket.name}` : ''
  const summary =
    computedMinor === actualMinor
      ? `Confirm the balance${where} is ${fmt(actualMinor, ctx.symbol)} (matches what Penda already shows).`
      : `Set your balance${where} to ${fmt(actualMinor, ctx.symbol)} (Penda currently shows ${fmt(computedMinor, ctx.symbol)}).`

  ctx.pendingActions.push(
    await insertPendingAction(ctx, {
      kind: 'reconcile',
      domain: 'reconciliation',
      targetId: ctx.walletId,
      patch: {
        amount: actualMinor,
        account_id: patchAccountId,
        // When true, confirm path recomputes money-account total (not pocket).
        scope_wallet: !accountId,
      },
      summary,
    }),
  )
  return `Staged, NOT applied: ${summary} The user must confirm it on the card. Ask them to confirm; do not say it's done.`
}

async function stageCreateDebt(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const amount = Number(input.amount)
  if (!amount || amount <= 0) return 'Debt amount must be a positive number.'

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

  const summary =
    `Add debt "${name}" (${direction === 'i_owe' ? 'I owe' : 'owed to me'} ` +
    `${fmt(principalMinor, ctx.symbol)}` +
    (counterparty ? `, ${counterparty}` : '') +
    ').'

  return await stageCreate(ctx, {
    domain: 'debt',
    summary,
    patch: {
      wallet_id: ctx.walletId,
      name,
      direction,
      counterparty,
      principal_minor: principalMinor,
      balance_minor: principalMinor,
      interest_rate: null,
      due_date: dueDate,
    },
  })
}

// Repaying / settling a debt. Mirrors the "Log a payment" button: posts a
// linked transaction to the resolved pocket (so its balance actually reflects
// the payment, filed under the system "Debt payment" category), then inserts
// a debt_payments row and lets the sync_debt_balance trigger drop
// balance_minor (which is what fills the card's progress bar). Never touches
// principal or deletes the debt, so history stays intact and the card reads
// correctly. Same two-step shape as the app's own PaymentForm → useAddPayment
// (not the atomic log_borrow_or_lend RPC) — kept consistent with that path
// rather than introduced as a one-off.
async function handleLogDebtPayment(
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<{ summary: string; debtId?: string }> {
  const id = typeof args.id === 'string' ? args.id : ''
  if (!id) return { summary: 'I need the debt id, look it up first with query_records.' }

  const { data: debt, error: loadError } = await ctx.supabase
    .from('debts')
    .select('id, name, direction, balance_minor, wallet_id, archived_at')
    .eq('id', id)
    .maybeSingle()
  if (loadError) return { summary: `Failed to load that debt: ${loadError.message}` }
  if (!debt || debt.wallet_id !== ctx.walletId) {
    return { summary: `I can't find that debt, look it up again with query_records.` }
  }
  if (debt.archived_at) {
    return { summary: `The debt "${debt.name}" is archived, so there is nothing to pay.` }
  }

  const outstanding = Number(debt.balance_minor) || 0
  if (outstanding <= 0) {
    return { summary: `The debt "${debt.name}" is already fully settled.`, debtId: debt.id as string }
  }

  let amountMinor: number
  if (args.amount === undefined || args.amount === null || args.amount === '') {
    amountMinor = outstanding // no amount given → settle in full
  } else {
    const amount = Number(args.amount)
    if (!isFinite(amount) || amount <= 0) {
      return { summary: 'Amount must be a positive number.' }
    }
    // Never let the AI overpay past the balance (would push it negative).
    amountMinor = Math.min(Math.round(amount * 100), outstanding)
  }

  const paidDate =
    typeof args.paid_date === 'string' && args.paid_date ? args.paid_date : today()

  // Resolve the pocket the payment moved through, same fallback as
  // create_transaction: the named pocket, else the wallet's default one.
  const fallbackAccount = await defaultAccountId(ctx.supabase, ctx.walletId)
  const accountId = resolveAccountId(ctx.accounts, args.account, fallbackAccount)

  let transactionId: string | null = null
  if (accountId) {
    const categoryId = findCategory(ctx.categories, DEBT_PAYMENT_CATEGORY_NAME)?.id ?? null
    const { data: tx, error: txError } = await ctx.supabase
      .from('transactions')
      .insert({
        wallet_id: ctx.walletId,
        created_by: ctx.userId,
        account_id: accountId,
        category_id: categoryId,
        amount_minor: amountMinor,
        currency: ctx.currency,
        type: debt.direction === 'i_owe' ? 'expense' : 'income',
        merchant: null,
        description: `Payment: ${debt.name}`,
        transaction_date: paidDate,
        source: 'chat',
        user_confirmed: true,
      })
      .select('id')
      .single()
    if (txError) return { summary: `Failed to log the linked transaction: ${txError.message}` }
    transactionId = tx.id
  }

  const { error: insertError } = await ctx.supabase.from('debt_payments').insert({
    debt_id: debt.id,
    amount_minor: amountMinor,
    paid_date: paidDate,
    account_id: accountId,
    transaction_id: transactionId,
  })
  if (insertError) return { summary: `Failed to log payment: ${insertError.message}` }

  const remaining = outstanding - amountMinor
  const accountName = accountId ? ctx.accounts.find((a) => a.id === accountId)?.name : null
  const viaLabel = accountName ? ` via ${accountName}` : ''
  const summary =
    remaining <= 0
      ? `Paid ${fmt(amountMinor, ctx.symbol)}${viaLabel} toward "${debt.name}", now fully settled.`
      : `Paid ${fmt(amountMinor, ctx.symbol)}${viaLabel} toward "${debt.name}", ${fmt(remaining, ctx.symbol)} left.`
  return { summary, debtId: debt.id as string }
}

// Atomic multi-tool chain (roadmap bet #4): borrowing/lending needs a wallet
// transaction AND a debt to land together or not at all. Both inserts happen
// inside the log_borrow_or_lend Postgres function (see migration 0026), if
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
  const categoryId = findCategory(ctx.categories, input.category)?.id ?? null
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
        `Failed to record the ${verb}: ${reason}. Nothing was saved, the transaction and the ` +
        `debt roll back together, so there is no half-recorded entry to clean up.`,
    }
  }

  const verb = direction === 'i_owe' ? 'Borrowed' : 'Lent'
  const withWhom = counterparty ? ` ${direction === 'i_owe' ? 'from' : 'to'} ${counterparty}` : ''
  return {
    transaction: { id: data.transaction_id, amount_minor: amountMinor, type: direction === 'i_owe' ? 'income' : 'expense' },
    debtId: data.debt_id,
    summary:
      `${verb} ${fmt(amountMinor, ctx.symbol)}${withWhom}, recorded both the transaction ` +
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
      start_date: { column: 'start_date', kind: 'raw' },
      end_date: { column: 'end_date', kind: 'raw' },
    },
    describe: (row, sym) =>
      (row.period === 'custom'
        ? `the ${row.start_date} to ${row.end_date} budget of ${fmt(row.amount_minor, sym)}`
        : `the ${row.period} budget of ${fmt(row.amount_minor, sym)}`) +
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
      icon: { column: 'icon', kind: 'raw' },
      motivation: { column: 'motivation', kind: 'raw' },
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
  recurring: {
    table: 'recurring_transactions',
    select: '*',
    softDelete: false,
    deletable: true,
    // Flat fields plus template_* handled in buildRecurringPatch.
    fields: {
      frequency: { column: 'frequency', kind: 'raw' },
      next_run_date: { column: 'next_run_date', kind: 'raw' },
      is_active: { column: 'is_active', kind: 'raw' },
    },
    describe: (row, sym) => {
      const t = (row.template ?? {}) as Record<string, unknown>
      const label = t.merchant || t.description || 'recurring'
      return `the ${row.frequency} ${t.type ?? 'expense'} "${label}" (${fmt(t.amount_minor, sym)})`
    },
  },
  pact: {
    table: 'commitment_pacts',
    select: '*, category:categories(id, name)',
    softDelete: false,
    deletable: true,
    fields: {
      description: { column: 'description', kind: 'raw' },
      category: { column: 'category_id', kind: 'category' },
      start_date: { column: 'start_date', kind: 'raw' },
      end_date: { column: 'end_date', kind: 'raw' },
    },
    describe: (row) => `the pact "${row.description}"`,
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
      const match = findCategory(categories, raw)
      if (!match) {
        throw new Error(
          `No category named "${raw}". Create it with create_category first, or pick an existing one.`,
        )
      }
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
  if (!data) throw new Error(`No ${domain} found with id ${id}, look it up again with query_records; it may have changed or been removed.`)
  return data as Row
}

async function stageCreate(
  ctx: ToolContext,
  input: { domain: string; summary: string; patch: Record<string, unknown> },
): Promise<string> {
  const highImpact = createPatchIsHighImpact(input.patch)
  const { consent, trust } = await loadMutationTrust(ctx)
  if (mayAutoApplyMutation('create', consent, trust, { highImpact })) {
    ctx.autoApplied = true
    return await autoApplyCreate(ctx, input)
  }
  // Placeholder target_id until confirm inserts the row (NOT NULL on the table).
  const placeholderId = crypto.randomUUID()
  ctx.pendingActions.push(
    await insertPendingAction(ctx, {
      kind: 'create',
      domain: input.domain,
      targetId: placeholderId,
      patch: input.patch,
      summary: input.summary,
    }),
  )
  const reason = highImpact
    ? 'This is a large money create, so'
    : 'The user must'
  return `Staged, NOT applied: ${input.summary} ${reason} confirm it on the card. Ask them to confirm; do not say it's done.`
}

async function autoApplyCreate(
  ctx: ToolContext,
  input: { domain: string; summary: string; patch: Record<string, unknown> },
): Promise<string> {
  const placeholderId = crypto.randomUUID()
  const pending = await insertPendingAction(ctx, {
    kind: 'create',
    domain: input.domain,
    targetId: placeholderId,
    patch: input.patch,
    summary: input.summary,
    status: 'auto_applied',
  })
  try {
    const result = await executePendingAction(ctx.supabase, {
      id: pending.id,
      kind: 'create',
      domain: input.domain,
      target_id: placeholderId,
      wallet_id: ctx.walletId,
      user_id: ctx.userId,
      patch: input.patch,
      summary: input.summary,
      status: 'auto_applied',
    })
    const targetId = result?.targetId ?? placeholderId
    ctx.createdIds[input.domain] = targetId
    const consent = ctx._consent ?? normalizeAiConsent(null)
    const trust = ctx._trust ?? normalizeAiTrust(null)
    await persistTrustAfterConfirm(ctx.supabase, ctx.userId, consent, trust)
    ctx.completedActions.push({
      id: pending.id,
      tool: `create_${input.domain === 'recurring' ? 'recurring_transaction' : input.domain}`,
      domain: input.domain,
      label: 'Created',
      summary: input.summary,
      status: 'done',
      targetId,
    })
    return `Applied (no confirmation needed, user trust/consent allows small creates): ${input.summary} Tell the user it's done.`
  } catch (error) {
    await ctx.supabase.from('ai_pending_actions').delete().eq('id', pending.id)
    throw error
  }
}

async function insertPendingAction(
  ctx: ToolContext,
  input: {
    kind: 'create' | 'update' | 'delete' | 'reconcile'
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

async function loadMutationTrust(ctx: ToolContext) {
  const { consent, trust } = await loadConsentAndTrust(ctx.supabase, ctx.userId)
  ctx._consent = consent
  ctx._trust = trust
  return { consent, trust }
}

async function autoApplyUpdate(
  ctx: ToolContext,
  input: {
    domain: string
    targetId: string
    patch: Record<string, unknown>
    summary: string
  },
): Promise<string> {
  const pending = await insertPendingAction(ctx, {
    kind: 'update',
    domain: input.domain,
    targetId: input.targetId,
    patch: input.patch,
    summary: input.summary,
    status: 'auto_applied',
  })
  try {
    await executePendingAction(ctx.supabase, {
      id: pending.id,
      kind: 'update',
      domain: input.domain,
      target_id: input.targetId,
      wallet_id: ctx.walletId,
      user_id: ctx.userId,
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
    tool: 'update_record',
    domain: input.domain,
    label: 'Updated',
    summary: input.summary,
    status: 'done',
    targetId: input.targetId,
  })
  return `Applied (no confirmation needed, user trust/consent allows small edits): ${input.summary} Tell the user it's done.`
}

async function stageUpdate(ctx: ToolContext, args: Record<string, unknown>): Promise<string> {
  const domain = String(args.domain ?? '')
  const cfg = CRUD_DOMAINS[domain]
  if (!cfg) return `I can't edit "${domain}".`
  const id = String(args.id ?? '')
  if (!id) return 'I need the record id, find it first with query_records.'

  const row = await loadTarget(ctx, cfg, domain, id)
  if (cfg.softDelete && row.deleted_at) return `That ${domain} was already deleted.`
  const guardMsg = cfg.guard?.(row)
  if (guardMsg) return guardMsg

  const changes = (args.changes ?? {}) as Record<string, unknown>
  const { patch, diff } =
    domain === 'recurring'
      ? buildRecurringPatch(row, changes, ctx.categories, ctx.symbol)
      : buildPatch(cfg, row, changes, ctx.categories, ctx.symbol)
  if (Object.keys(patch).length === 0) {
    return `Nothing to change on ${cfg.describe(row, ctx.symbol)}, the values already match.`
  }

  const before: Record<string, unknown> = {}
  for (const key of Object.keys(patch)) before[key] = row[key]
  const patchWithUndo = { ...patch, __before: before }
  const highImpact =
    domain === 'recurring'
      ? createPatchIsHighImpact(patch) || patchIsHighImpact(patch, before)
      : patchIsHighImpact(patch, before)

  const summary = `Update ${cfg.describe(row, ctx.symbol)}, ${diff.join('; ')}.`
  const { consent, trust } = await loadMutationTrust(ctx)
  if (mayAutoApplyMutation('update', consent, trust, { highImpact })) {
    ctx.autoApplied = true
    return await autoApplyUpdate(ctx, {
      domain,
      targetId: id,
      patch: patchWithUndo,
      summary,
    })
  }
  ctx.pendingActions.push(
    await insertPendingAction(ctx, { kind: 'update', domain, targetId: id, patch: patchWithUndo, summary }),
  )
  const reason = highImpact
    ? 'This is a large or multi-field money change, so'
    : 'The user must'
  return `Staged, NOT applied: ${summary} ${reason} confirm it on the card. Ask them to confirm; do not say it's done.`
}

function buildRecurringPatch(
  row: Row,
  changes: Record<string, unknown>,
  categories: Category[],
  sym: string,
): { patch: Record<string, unknown>; diff: string[] } {
  const patch: Record<string, unknown> = {}
  const diff: string[] = []
  const template = { ...((row.template ?? {}) as Record<string, unknown>) }
  let templateChanged = false

  for (const [key, raw] of Object.entries(changes)) {
    if (key === 'frequency' || key === 'next_run_date') {
      const value = raw === '' ? null : raw
      if (row[key] === value) continue
      patch[key] = value
      diff.push(`${key}: ${row[key] ?? 'none'} → ${value ?? 'none'}`)
      continue
    }
    if (key === 'is_active') {
      const value = raw === true || raw === 'true' || raw === 1 || raw === '1'
      if (Boolean(row.is_active) === value) continue
      patch.is_active = value
      diff.push(`is_active: ${row.is_active} → ${value}`)
      continue
    }
    if (key === 'amount') {
      const n = Number(raw)
      if (!isFinite(n) || n < 0) throw new Error('"amount" must be a non-negative number.')
      const value = Math.round(n * 100)
      if (template.amount_minor === value) continue
      template.amount_minor = value
      templateChanged = true
      diff.push(`amount: ${fmt(row.template?.amount_minor, sym)} → ${fmt(value, sym)}`)
      continue
    }
    if (key === 'type') {
      const value = raw === 'income' ? 'income' : 'expense'
      if (template.type === value) continue
      const prev = template.type
      template.type = value
      templateChanged = true
      diff.push(`type: ${prev ?? 'none'} → ${value}`)
      continue
    }
    if (key === 'category') {
      const match = findCategory(categories, raw)
      if (!match) {
        throw new Error(
          `No category named "${raw}". Create it with create_category first, or pick an existing one.`,
        )
      }
      if (template.category_id === match.id) continue
      template.category_id = match.id
      templateChanged = true
      diff.push(`category: ${formatCol('category_id', row.template?.category_id, sym, categories)} → ${match.name}`)
      continue
    }
    if (key === 'merchant' || key === 'description') {
      const value = raw === '' || raw == null ? null : String(raw)
      if ((template[key] ?? null) === value) continue
      template[key] = value
      templateChanged = true
      diff.push(`${key}: ${row.template?.[key] ?? 'none'} → ${value ?? 'none'}`)
    }
  }

  if (templateChanged) patch.template = template
  return { patch, diff }
}

async function stageDelete(ctx: ToolContext, args: Record<string, unknown>): Promise<string> {
  const domain = String(args.domain ?? '')
  const cfg = CRUD_DOMAINS[domain]
  if (!cfg) return `I can't delete "${domain}".`
  if (!cfg.deletable) return `Deleting a ${domain} isn't allowed.`
  const id = String(args.id ?? '')
  if (!id) return 'I need the record id, find it first with query_records.'

  const row = await loadTarget(ctx, cfg, domain, id)
  if (cfg.softDelete && row.deleted_at) return `That ${domain} is already deleted.`
  const guardMsg = cfg.guard?.(row)
  if (guardMsg) return guardMsg

  // Snapshot for undo (soft-delete restore or hard-delete reinsert).
  const before: Record<string, unknown> = { ...row }
  delete before.category
  const patch = { __before: before }

  const summary = `Delete ${cfg.describe(row, ctx.symbol)}.`
  // Deletes always require an explicit confirm, even with act_without_confirm / auto_loose.
  await loadMutationTrust(ctx)
  ctx.pendingActions.push(await insertPendingAction(ctx, { kind: 'delete', domain, targetId: id, patch, summary }))
  return `Staged, NOT applied: ${summary} Deletes always need confirmation on the card. Ask them to confirm; do not say it's done.`
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
  const { supabase, walletId, symbol, categories } = ctx

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
    // Budgets are few; default to 50 so totals aren't silently truncated.
    const budgetLimit = Math.min(Math.max(Number(args.limit) || 50, 1), 50)
    const { data, error } = await supabase
      .from('budgets')
      .select('id, amount_minor, period, rollover, category:categories(name)')
      .eq('wallet_id', walletId)
      .order('period')
      .limit(budgetLimit)
    if (error) throw new Error(error.message)
    rows = (data ?? []).map((r: Row) => ({
      id: r.id,
      amount: fmt(r.amount_minor, symbol),
      amount_minor: Number(r.amount_minor) || 0,
      period: r.period,
      rollover: r.rollover,
      category: r.category?.name ?? null,
    }))
  } else if (domain === 'recurring') {
    const recurringLimit = Math.min(Math.max(Number(args.limit) || 50, 1), 50)
    const { data, error } = await supabase
      .from('recurring_transactions')
      .select('id, template, frequency, next_run_date, is_active')
      .eq('wallet_id', walletId)
      .order('next_run_date')
      .limit(recurringLimit)
    if (error) throw new Error(error.message)
    rows = (data ?? []).map((r: Row) => {
      const t = (r.template ?? {}) as Record<string, unknown>
      return {
        id: r.id,
        amount: fmt(t.amount_minor, symbol),
        amount_minor: Number(t.amount_minor) || 0,
        type: t.type ?? 'expense',
        merchant: t.merchant ?? null,
        description: t.description ?? null,
        frequency: r.frequency,
        next_run_date: r.next_run_date,
        is_active: r.is_active,
        category: categories.find((c) => c.id === t.category_id)?.name ?? null,
      }
    })
    if (search) {
      const needle = search.toLowerCase()
      rows = rows.filter(
        (r) =>
          String(r.merchant ?? '').toLowerCase().includes(needle) ||
          String(r.description ?? '').toLowerCase().includes(needle) ||
          String(r.category ?? '').toLowerCase().includes(needle),
      )
    }
  } else if (domain === 'pact') {
    const { data, error } = await supabase
      .from('commitment_pacts')
      .select('id, description, start_date, end_date, category:categories(name)')
      .eq('wallet_id', walletId)
      .order('end_date', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    rows = (data ?? []).map((r: Row) => ({
      id: r.id,
      description: r.description,
      start_date: r.start_date,
      end_date: r.end_date,
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

  // Server-side totals for money lists so the model does not add in prose.
  if (domain === 'budget' || domain === 'recurring') {
    const totalMinor = rows.reduce((sum, r) => sum + (Number(r.amount_minor) || 0), 0)
    const publicRows = rows.map(({ amount_minor: _omit, ...rest }) => rest)
    return (
      `Found ${publicRows.length} ${domain}(s) totaling ${fmt(totalMinor, symbol)}: ` +
      `${JSON.stringify(publicRows)}. Use this total; do not re-add the amounts yourself.`
    )
  }

  return `Found ${rows.length} ${domain}(s): ${JSON.stringify(rows)}`
}

async function handleSpendingSummary(ctx: ToolContext, args: Record<string, unknown>): Promise<string> {
  const since = String(args.since ?? '')
  if (!since) return 'I need a start date to total spending.'
  const until = args.until ? String(args.until) : today()

  // Aggregated in SQL (migration 0036), the old version pulled up to 1000
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

async function handleConvertCurrency(args: Record<string, unknown>): Promise<string> {
  const result = await convertCurrency(Number(args.amount), args.from_currency, args.to_currency)
  return result.ok ? result.summary : result.error
}

async function stageCreateBudget(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const amount = Number(input.amount)
  if (!amount || amount <= 0) return 'Budget amount must be a positive number.'
  const period = input.period === 'weekly' || input.period === 'custom' ? input.period : 'monthly'
  const category = findCategory(ctx.categories, input.category)
  const amountMinor = Math.round(amount * 100)

  let startDate: string | undefined
  let endDate: string | null = null
  if (period === 'custom') {
    const rawEnd = typeof input.end_date === 'string' ? input.end_date : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawEnd)) return 'I need end_date as YYYY-MM-DD for a custom-range budget.'
    startDate =
      typeof input.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.start_date)
        ? input.start_date
        : today()
    if (rawEnd < startDate) return 'end_date must be on or after start_date.'
    endDate = rawEnd
  }

  const summary =
    period === 'custom'
      ? `Create a budget of ${fmt(amountMinor, ctx.symbol)} from ${startDate} to ${endDate}` +
        (category ? ` for ${category.name}` : '') +
        '.'
      : `Create a ${period} budget of ${fmt(amountMinor, ctx.symbol)}` +
        (category ? ` for ${category.name}` : '') +
        '.'

  return await stageCreate(ctx, {
    domain: 'budget',
    summary,
    patch: {
      wallet_id: ctx.walletId,
      category_id: category?.id ?? null,
      amount_minor: amountMinor,
      period,
      rollover: period === 'custom' ? false : input.rollover === true,
      ...(period === 'custom' ? { start_date: startDate, end_date: endDate } : {}),
    },
  })
}

async function stageCreateGoal(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const target = Number(input.target_amount)
  if (!target || target <= 0) return 'Goal target must be a positive number.'
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Savings goal'
  const current = Number(input.current_amount)
  const targetMinor = Math.round(target * 100)
  const currentMinor = isFinite(current) && current > 0 ? Math.round(current * 100) : 0
  const icon =
    typeof input.icon === 'string' && input.icon.trim() ? input.icon.trim().slice(0, 16) : null
  const motivation =
    typeof input.motivation === 'string' && input.motivation.trim()
      ? input.motivation.trim().slice(0, 280)
      : null
  const summary = `Create the goal "${name}" targeting ${fmt(targetMinor, ctx.symbol)}.`

  return await stageCreate(ctx, {
    domain: 'goal',
    summary,
    patch: {
      wallet_id: ctx.walletId,
      name,
      target_amount_minor: targetMinor,
      current_amount_minor: currentMinor,
      target_date: typeof input.target_date === 'string' ? input.target_date : null,
      icon,
      motivation,
    },
  })
}

async function stageCreatePocket(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : null
  if (!name) return 'Pocket name is required.'
  if (ctx.accounts.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
    return `"${name}" already exists as a pocket. Use set_balance to adjust it instead of creating a duplicate.`
  }
  const kindWanted = typeof input.kind === 'string' ? input.kind.trim().toLowerCase() : ''
  const kind =
    ctx.kinds.find((k) => k.name.toLowerCase() === kindWanted) ??
    ctx.kinds.find((k) => k.name === 'Other') ??
    ctx.kinds[0]
  const opening = Number(input.opening_balance)
  const openingMinor = isFinite(opening) && opening > 0 ? Math.round(opening * 100) : 0
  const summary =
    openingMinor > 0
      ? `Create the pocket "${name}" with an opening balance of ${fmt(openingMinor, ctx.symbol)}.`
      : `Create the pocket "${name}".`

  return await stageCreate(ctx, {
    domain: 'account',
    summary,
    patch: {
      wallet_id: ctx.walletId,
      name,
      kind_id: kind?.id ?? null,
      opening_balance_minor: openingMinor,
    },
  })
}

const RECURRING_FREQUENCIES = new Set(['daily', 'weekly', 'monthly', 'yearly'])

async function stageCreateRecurring(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const amount = Number(input.amount)
  if (!amount || amount <= 0) return 'Amount must be a positive number.'
  const frequency = String(input.frequency ?? '')
  if (!RECURRING_FREQUENCIES.has(frequency)) {
    return 'Frequency must be daily, weekly, monthly, or yearly.'
  }
  const nextRun = typeof input.next_run_date === 'string' ? input.next_run_date : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextRun)) return 'I need next_run_date as YYYY-MM-DD.'
  const type = input.type === 'income' ? 'income' : 'expense'
  const category = findCategory(ctx.categories, input.category)
  const merchant = typeof input.merchant === 'string' ? input.merchant.trim() || null : null
  const description = typeof input.description === 'string' ? input.description.trim() || null : null
  const amountMinor = Math.round(amount * 100)
  const label = merchant || description || category?.name || (type === 'income' ? 'income' : 'bill')
  const summary = `Add ${frequency} ${type} "${label}" for ${fmt(amountMinor, ctx.symbol)}, next on ${nextRun}.`

  return await stageCreate(ctx, {
    domain: 'recurring',
    summary,
    patch: {
      wallet_id: ctx.walletId,
      created_by: ctx.userId,
      template: {
        category_id: category?.id ?? null,
        amount_minor: amountMinor,
        currency: ctx.currency,
        type,
        merchant,
        description,
      },
      frequency,
      next_run_date: nextRun,
      is_active: true,
    },
  })
}

async function stageCreatePact(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const description = typeof input.description === 'string' ? input.description.trim() : ''
  if (!description) return 'A pact needs a description.'
  const endDate = typeof input.end_date === 'string' ? input.end_date : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return 'I need end_date as YYYY-MM-DD.'
  const startDate =
    typeof input.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.start_date)
      ? input.start_date
      : today()
  const category = findCategory(ctx.categories, input.category)
  const summary =
    `Create pact "${description}"` +
    (category ? ` on ${category.name}` : '') +
    ` until ${endDate}.`

  return await stageCreate(ctx, {
    domain: 'pact',
    summary,
    patch: {
      wallet_id: ctx.walletId,
      created_by: ctx.userId,
      description,
      category_id: category?.id ?? null,
      goal_id: null,
      start_date: startDate,
      end_date: endDate,
      stake_kind: null,
      stake_amount_minor: null,
      stake_note: null,
    },
  })
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
    .select('id, name')
    .single()
  if (error) return `Failed to create category: ${error.message}`
  if (!data?.id) return `Created the category "${name}".`

  ctx.createdIds.category = data.id
  // ctx.categories is the turn's snapshot and every other tool resolves category
  // names against it, so a category created mid-turn must land here too. Without
  // this, "create Pets, then move the dog food entry into it" created the
  // category and then failed the update with "No category named Pets".
  ctx.categories.push({ id: data.id, name: data.name ?? name })
  return (
    `Created the category "${name}". It is usable right now in this same turn: ` +
    `pass category "${name}" to update_record, create_transaction, or create_budget. ` +
    `Do not look it up first.`
  )
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
  const category = findCategory(ctx.categories, categoryName)
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
