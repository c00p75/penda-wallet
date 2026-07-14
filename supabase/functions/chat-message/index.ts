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

const PERSONALITY_PROMPTS: Record<string, string> = {
  balanced_coach: 'Your tone is warm, encouraging, and balanced — a supportive financial coach.',
  angry_mom: "Your tone is exasperated but loving, like a mom who's tired of seeing money wasted on takeout.",
  wise_mentor: 'Your tone is calm and reflective, offering perspective rather than judgment.',
  chill_friend: "Your tone is casual and easygoing, like a friend who's just keeping you honest.",
  drill_sergeant: 'Your tone is blunt and no-nonsense, pushing for discipline and accountability.',
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

    const tools = buildTools(categories)
    const systemInstruction = buildSystemInstruction(personality)

    const userMessage: NeutralMessage = { role: 'user', parts: [{ type: 'text', text: body.message }] }
    await insertMessage(supabase, conversationId, userMessage)

    const neutralHistory: NeutralMessage[] = [...history, userMessage]
    let createdTransaction: Record<string, unknown> | null = null

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
        return jsonResponse({ conversationId, reply: turn.text, transaction: createdTransaction })
      }

      const toolResultParts: NeutralPart[] = []
      for (const call of turn.toolCalls) {
        let summary: string
        if (call.name === 'create_transaction') {
          const result = await handleCreateTransaction(supabase, body.walletId, user.id, categories, rules, call.args)
          createdTransaction = result.transaction
          summary = result.summary
        } else if (call.name === 'create_debt') {
          summary = (await handleCreateDebt(supabase, body.walletId, call.args)).summary
        } else {
          summary = `Unknown tool "${call.name}" — no action taken.`
        }
        // Every tool call must get a matching result, or the provider's next
        // turn breaks (unbalanced function-call / function-response pairs).
        toolResultParts.push({ type: 'tool_result', id: call.id, name: call.name, result: summary })
      }

      const toolResultMessage: NeutralMessage = { role: 'user', parts: toolResultParts }
      await insertMessage(supabase, conversationId, toolResultMessage)
      neutralHistory.push(toolResultMessage)
    }

    return jsonResponse({
      conversationId,
      reply: "Sorry, I'm having trouble completing that one — could you try rephrasing?",
      transaction: createdTransaction,
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

function buildSystemInstruction(personality: string): string {
  const houseRules = `You are Penda, an AI assistant embedded in a personal finance app. Your job in this
conversation is to help the user log transactions by talking naturally — you are not a generic
chatbot, you are the primary way this user records spending and income.

When the user describes a purchase, payment, or income (e.g. "I spent $12 on coffee at Blue Bottle",
"got paid $2000"), call the create_transaction tool with your best judgment for amount, type,
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

After the tool result(s) come back, reply with a short, natural confirmation. Do not restate every
field back at the user like a receipt — just confirm briefly in your own voice.`

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
  ]
}

async function handleCreateTransaction(
  supabase: SupabaseClient,
  walletId: string,
  userId: string,
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
      currency: 'USD',
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

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
