import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { GoogleGenAI, type Content, type Part } from 'npm:@google/genai@2.11.0'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!

const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GROQ_MODEL = 'llama-3.3-70b-versatile'
const MAX_TOOL_ITERATIONS = 4

// Symbols for the currencies the app offers (mirrors apps/web/src/lib/currencies.ts).
// Used only to help the model speak money in the wallet's currency; falls back to the code.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹', CAD: '$', AUD: '$',
  CHF: 'CHF', ZAR: 'R', NGN: '₦', KES: 'KSh', GHS: 'GH₵', ZMW: 'K', EGP: 'E£',
  MAD: 'MAD', BRL: 'R$', MXN: '$', ARS: '$', SGD: '$', HKD: '$', AED: 'AED',
  SAR: 'SAR', ILS: '₪', TRY: '₺', RUB: '₽', KRW: '₩', IDR: 'Rp', MYR: 'RM',
  THB: '฿', PHP: '₱', VND: '₫', PLN: 'zł', SEK: 'kr', NOK: 'kr', DKK: 'kr', NZD: '$',
}

const PERSONALITY_PROMPTS: Record<string, string> = {
  balanced_coach: 'Your tone is warm, encouraging, and balanced — a supportive financial coach.',
  angry_mom: "Your tone is exasperated but loving, like a mom who's tired of seeing money wasted on takeout.",
  wise_mentor: 'Your tone is calm and reflective, offering perspective rather than judgment.',
  chill_friend: "Your tone is casual and easygoing, like a friend who's just keeping you honest.",
  drill_sergeant: 'Your tone is blunt and no-nonsense, pushing for discipline and accountability.',
  funny_comedian:
    'Your tone is playful and funny — a stand-up comedian who lands a quick joke or witty aside, ' +
    'then still gives real, useful guidance. Keep it light, never mean, and never let the joke ' +
    'get in the way of logging the transaction correctly.',
  gen_z:
    'Your tone is a very-online Gen-Z best friend — high energy, casual slang, and genuine hype ' +
    'when the user does well. Celebrate wins loudly and keep it real, but never let the vibe get ' +
    'in the way of accurate, useful guidance. Emoji are fine; keep them sparing.',
  hustler:
    'Your tone is that of an entrepreneurial hustler with a growth mindset. You frame money as ' +
    'something to grow, not just protect — nudging toward earning more, side income, and reinvesting, ' +
    'while still respecting the budget. Motivating and pragmatic, never reckless.',
  gogo:
    'Your tone is that of a warm grandmother (gogo) — unhurried, wise, and frugal, fond of a short ' +
    'proverb and a save-for-the-rainy-day mindset. Gentle and encouraging, never nagging.',
  analyst:
    'Your tone is that of a precise financial analyst: cold, quantitative, and to the point. Lead ' +
    'with the numbers — figures, rates, and projections — and skip emotional framing. No fluff.',
}

interface ChatRequestBody {
  walletId: string
  conversationId?: string
  message: string
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
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
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
      return jsonResponse({ error: 'Invalid or expired session' }, 401)
    }

    const body = (await req.json()) as ChatRequestBody
    if (!body.walletId || !body.message) {
      return jsonResponse({ error: 'walletId and message are required' }, 400)
    }

    const conversationId = await getOrCreateConversation(supabase, user.id, body.walletId, body.conversationId)
    const history = await fetchHistory(supabase, conversationId)
    const categories = await fetchCategories(supabase, body.walletId)
    const rules = await fetchCategorizationRules(supabase, body.walletId)
    const personality = await fetchPersonality(supabase, user.id)
    const currency = await fetchWalletCurrency(supabase, body.walletId)

    const tools = buildTools(categories)
    const systemInstruction = buildSystemInstruction(personality, currency)

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
    }

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const turn = await callModel(neutralHistory, systemInstruction, tools)

      const assistantParts: NeutralPart[] = []
      if (turn.text) assistantParts.push({ type: 'text', text: turn.text })
      for (const call of turn.toolCalls) {
        assistantParts.push({ type: 'tool_call', id: call.id, name: call.name, args: call.args })
      }
      const assistantMessage: NeutralMessage = { role: 'assistant', parts: assistantParts }
      await insertMessage(supabase, conversationId, assistantMessage)
      neutralHistory.push(assistantMessage)

      if (turn.toolCalls.length === 0) {
        return jsonResponse({
          conversationId,
          reply: turn.text,
          transaction: ctx.createdTransaction,
          pendingActions: ctx.pendingActions,
        })
      }

      const toolResultParts: NeutralPart[] = []
      for (const call of turn.toolCalls) {
        let summary: string
        try {
          summary = await dispatchTool(ctx, call.name, call.args)
        } catch (err) {
          // Agentic reliability: a tool that throws must never abort the whole
          // turn or leave a chain half-applied. Feed the failure back so the
          // model can recover or tell the user, and so every tool_call keeps a
          // matching result (unbalanced pairs break the provider's next turn).
          console.error(`Tool ${call.name} threw:`, err)
          summary = `Tool "${call.name}" failed: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was saved for this step — do not claim it succeeded.`
        }
        toolResultParts.push({ type: 'tool_result', id: call.id, name: call.name, result: summary })
      }

      const toolResultMessage: NeutralMessage = { role: 'user', parts: toolResultParts }
      await insertMessage(supabase, conversationId, toolResultMessage)
      neutralHistory.push(toolResultMessage)
    }

    return jsonResponse({
      conversationId,
      reply: "Sorry, I'm having trouble completing that one — could you try rephrasing?",
      transaction: ctx.createdTransaction,
      pendingActions: ctx.pendingActions,
    })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

// --- Model orchestration -----------------------------------------------

async function callModel(
  history: NeutralMessage[],
  systemInstruction: string,
  tools: ToolDefinition[],
): Promise<ModelTurn> {
  try {
    return await callGemini(history, systemInstruction, tools)
  } catch (error) {
    console.error('Gemini call failed, falling back to Groq:', error)
    return await callGroq(history, systemInstruction, tools)
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
    config: { systemInstruction, tools: [{ functionDeclarations: tools }] },
  })

  const toolCalls = (response.functionCalls ?? []).map((call, index) => ({
    id: call.id ?? `gemini-call-${index}`,
    name: call.name ?? '',
    args: (call.args ?? {}) as Record<string, unknown>,
  }))

  return { text: response.text ?? '', toolCalls }
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
    body: JSON.stringify({ model: GROQ_MODEL, messages, tools: groqTools }),
  })

  if (!res.ok) {
    throw new Error(`Groq error ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  const message = data.choices[0].message

  const toolCalls = (message.tool_calls ?? []).map((call: {
    id: string
    function: { name: string; arguments: string }
  }) => ({
    id: call.id,
    name: call.function.name,
    args: JSON.parse(call.function.arguments || '{}'),
  }))

  return { text: message.content ?? '', toolCalls }
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

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
    if (data) return data.id
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
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(40)

  if (error) throw error
  return (data ?? []).map((row) => ({
    role: row.role as 'user' | 'assistant',
    parts: row.content as NeutralPart[],
  }))
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

async function fetchPersonality(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('ai_personality').eq('id', userId).maybeSingle()
  return data?.ai_personality ?? 'balanced_coach'
}

async function fetchWalletCurrency(supabase: SupabaseClient, walletId: string): Promise<string> {
  const { data } = await supabase.from('wallets').select('base_currency').eq('id', walletId).maybeSingle()
  return data?.base_currency ?? 'USD'
}

function buildSystemInstruction(personality: string, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency
  const houseRules = `You are Penda, an AI assistant embedded in a personal finance app. Your job in this
conversation is to help the user log transactions by talking naturally — you are not a generic
chatbot, you are the primary way this user records spending and income.

This wallet's currency is ${currency} (${symbol}). ALL amounts — in the transactions you log and in
everything you say back — are in ${currency}. When you mention money, write it with "${symbol}"
(e.g. ${symbol}12, ${symbol}2000). Never use "$" or any other currency's symbol unless "${symbol}"
literally is "$". The user only ever types plain numbers; the currency is always ${currency}.

When the user describes a purchase, payment, or income (e.g. "I spent 12 on coffee at Blue Bottle",
"got paid 2000"), call the create_transaction tool with your best judgment for amount, type,
category, merchant, and date.

Some messages imply more than one action — reason about what actually happened to the money and
fire EVERY action a single message implies, in the same turn:
- Borrowing ("I borrowed K500 from Amara", "took a loan"): the wallet goes UP, so call
  create_transaction (type income) AND create_debt (direction i_owe).
- Lending / being owed ("I lent Tich K200", "Tich owes me K200"): the wallet goes DOWN, so call
  create_transaction (type expense) AND create_debt (direction owed_to_me).
- If money was only promised and hasn't moved yet, record just the debt.
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
restate every field back at the user like a receipt — just confirm briefly in your own voice.`

  const personalityFragment = PERSONALITY_PROMPTS[personality] ?? PERSONALITY_PROMPTS.balanced_coach

  return `${houseRules}\n\n${personalityFragment}\n\nToday's date is ${today()}.`
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
        'Record a debt. Use when the user borrows money (direction "i_owe") or lends money / is owed ' +
        'money (direction "owed_to_me"). When money actually changes hands, call this ALONGSIDE ' +
        'create_transaction in the same turn: borrowing also increases the wallet (income), lending ' +
        'also decreases it (expense).',
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
  ]
}

// --- Tool dispatch ---------------------------------------------------------

async function dispatchTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'create_transaction': {
      const result = await handleCreateTransaction(
        ctx.supabase, ctx.walletId, ctx.userId, ctx.currency, ctx.categories, ctx.rules, args,
      )
      ctx.createdTransaction = result.transaction
      return result.summary
    }
    case 'create_debt':
      return (await handleCreateDebt(ctx.supabase, ctx.walletId, args)).summary
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
): Promise<{ transaction: Record<string, unknown> | null; summary: string }> {
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

  return { transaction: data, summary: `Saved: ${JSON.stringify(data)}` }
}

async function handleCreateDebt(
  supabase: SupabaseClient,
  walletId: string,
  input: Record<string, unknown>,
): Promise<{ summary: string }> {
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

  return { summary: `Saved debt: ${JSON.stringify(data)}` }
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
  input: { kind: 'update' | 'delete'; domain: string; targetId: string; patch: Record<string, unknown> | null; summary: string },
): Promise<PendingAction> {
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
    })
    .select('id')
    .single()

  if (error) throw new Error(`Couldn't stage the change: ${error.message}`)
  return { id: data.id, kind: input.kind, domain: input.domain, summary: input.summary }
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

  const summary = `Update ${cfg.describe(row, ctx.symbol)} — ${diff.join('; ')}.`
  ctx.pendingActions.push(await insertPendingAction(ctx, { kind: 'update', domain, targetId: id, patch, summary }))
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

  const summary = `Delete ${cfg.describe(row, ctx.symbol)}.`
  ctx.pendingActions.push(await insertPendingAction(ctx, { kind: 'delete', domain, targetId: id, patch: null, summary }))
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

  const { data, error } = await ctx.supabase
    .from('transactions')
    .select('amount_minor, type, category:categories(name)')
    .eq('wallet_id', ctx.walletId)
    .is('deleted_at', null)
    .gte('transaction_date', since)
    .lte('transaction_date', until)
    .limit(1000)
  if (error) throw new Error(error.message)

  let expense = 0
  let income = 0
  let expenseCount = 0
  const byCategory: Record<string, number> = {}
  for (const r of (data ?? []) as Row[]) {
    const amt = Number(r.amount_minor) || 0
    if (r.type === 'expense') {
      expense += amt
      expenseCount += 1
      const name = r.category?.name ?? 'Uncategorized'
      byCategory[name] = (byCategory[name] ?? 0) + amt
    } else if (r.type === 'income') {
      income += amt
    }
  }

  const top = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, amt]) => `${name} ${fmt(amt, ctx.symbol)}`)

  return (
    `From ${since} to ${until}: spent ${fmt(expense, ctx.symbol)} across ${expenseCount} transaction(s); ` +
    `income ${fmt(income, ctx.symbol)}.` +
    (top.length ? ` Top spending: ${top.join(', ')}.` : '')
  )
}

async function handleCreateBudget(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const amount = Number(input.amount)
  if (!amount || amount <= 0) return 'Budget amount must be a positive number.'
  const period = input.period === 'weekly' ? 'weekly' : 'monthly'
  const categoryId = ctx.categories.find((c) => c.name === input.category)?.id ?? null

  const { error } = await ctx.supabase.from('budgets').insert({
    wallet_id: ctx.walletId,
    category_id: categoryId,
    amount_minor: Math.round(amount * 100),
    period,
    rollover: input.rollover === true,
  })
  if (error) return `Failed to create budget: ${error.message}`
  return `Created a ${period} budget of ${fmt(Math.round(amount * 100), ctx.symbol)}.`
}

async function handleCreateGoal(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const target = Number(input.target_amount)
  if (!target || target <= 0) return 'Goal target must be a positive number.'
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Savings goal'
  const current = Number(input.current_amount)

  const { error } = await ctx.supabase.from('savings_goals').insert({
    wallet_id: ctx.walletId,
    name,
    target_amount_minor: Math.round(target * 100),
    current_amount_minor: isFinite(current) && current > 0 ? Math.round(current * 100) : 0,
    target_date: typeof input.target_date === 'string' ? input.target_date : null,
  })
  if (error) return `Failed to create goal: ${error.message}`
  return `Created the goal "${name}" targeting ${fmt(Math.round(target * 100), ctx.symbol)}.`
}

async function handleCreateCategory(ctx: ToolContext, input: Record<string, unknown>): Promise<string> {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!name) return 'A category needs a name.'

  const { error } = await ctx.supabase.from('categories').insert({
    wallet_id: ctx.walletId,
    name,
    icon: typeof input.icon === 'string' ? input.icon : null,
  })
  if (error) return `Failed to create category: ${error.message}`
  return `Created the category "${name}".`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
