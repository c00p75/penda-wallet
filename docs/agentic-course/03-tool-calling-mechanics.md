# 03 — Tool-Calling Mechanics

An LLM can only ever produce text. So how does typing "I spent 12 on coffee"
end up as a row in your `transactions` table? This module is the mechanical
answer: **tool calling** (also called "function calling").

## The core trick: structured output instead of free text

You give the model a menu of functions it's allowed to "call," each described
as a name, a description, and a JSON Schema of its parameters. On each turn,
the model — instead of (or in addition to) writing a reply — can emit a
structured object like:

```json
{ "name": "create_transaction", "args": { "type": "expense", "amount": 12, "category": "Food", "transaction_date": "2026-07-20" } }
```

The model was trained to do this reliably: given a schema, it fills in
arguments that match it. **But it never runs anything.** It just emits that
JSON. Your server reads the function name and arguments, and decides what to
actually do about it. This is the entire trick behind every "AI agent" you've
heard of — there's no magic beyond "structured output plus a dispatcher on
your server."

## The menu: `buildTools`

Look at `buildTools(categories)` in
[`chat-message/index.ts:1095`](../../supabase/functions/chat-message/index.ts#L1095).
Each tool is a plain object:

```ts
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
      transaction_date: { type: 'string', description: 'ISO date YYYY-MM-DD...' },
    },
    required: ['type', 'amount', 'category', 'transaction_date'],
  },
}
```

Two details worth internalizing:

- **`description` is the only place the model learns what a tool is for and
  when to use it.** There's no separate "training" step for your custom
  tools — the description *is* the instruction manual, read fresh on every
  call. Compare `create_debt`'s description ("money has NOT moved yet...") to
  `log_borrowed_or_lent_money`'s ("...use this INSTEAD of create_transaction
  plus create_debt whenever cash actually changes hands"). That contrast is
  doing real work steering the model to the right tool for two similar-sounding
  situations.
- **`category: { enum: categoryNames }` is built from live data**, not a
  hardcoded list (line 1096: `const categoryNames = categories.map((c) =>
  c.name)`). This closes off an entire class of mistakes: the model
  structurally *cannot* emit a category that doesn't exist for this wallet,
  because the schema itself only allows the categories you just fetched from
  the database for this specific user. Constrain the shape of what the model
  can say, and you eliminate whole categories of bugs before they can happen.

## One list, two provider formats

Gemini and Groq each want tool definitions shaped differently on the wire.
`buildTools` returns one neutral shape, and each provider adapter reshapes it
right before the call:

```ts
// Gemini (line 508)
config: { tools: [{ functionDeclarations: tools }], ... }

// Groq — OpenAI-style (line 562-565)
const groqTools = tools.map((tool) => ({
  type: 'function',
  function: { name: tool.name, description: tool.description, parameters: tool.parametersJsonSchema },
}))
```

You write the tool once; the adapter layer handles translating it. This is
the same "neutral shape, provider-specific adapter at the edge" pattern from
[02](02-anatomy-of-the-agent-loop.md) — you'll see it again and again in
agentic code, because every LLM provider standardized on *slightly*
incompatible JSON shapes for the same idea.

## The dispatcher: turning a name into code

`dispatchTool` (line 1501) is a plain `switch` on the tool name the model
sent back:

```ts
async function dispatchTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'create_transaction': { /* ... */ return result.summary }
    case 'query_records': return await handleQueryRecords(ctx, args)
    case 'update_record': return await stageUpdate(ctx, args)
    /* ...one case per tool... */
    default:
      return `Unknown tool "${name}", no action taken.`
  }
}
```

That `default` branch matters more than it looks. Models occasionally
hallucinate a tool name that doesn't exist, or a provider integration bug
sends something malformed. Rather than crashing, the dispatcher just tells
the model (via the tool-result message fed back into history) that nothing
happened — the loop keeps going and the model can recover. **Never assume the
model will only ever call tools you actually defined.**

## Never trust the arguments either

The JSON Schema only constrains *shape* (a string, a number, one of an enum).
It says nothing about business validity. Every handler re-validates:

```ts
// handleCreateTransaction, line 1573
const amount = Number(input.amount)
if (!amount || amount <= 0) {
  return { transaction: null, summary: 'Amount must be a positive number.' }
}
```

The schema says `amount` is a `number`; nothing stops the model from sending
`-50` or `0`. Treat every tool argument the same way you'd treat untrusted
user input from an HTML form — because that's exactly what it is, just typed
by a model instead of a person. This is also why the failure path returns a
*string explaining what went wrong* rather than throwing: that string becomes
the tool result the model sees next turn, so it can tell the user "that
amount didn't look right, can you confirm it?" instead of the whole request
crashing.

## Atomicity: when one "thing that happened" needs two tables updated

Here's a subtlety that's easy to miss until it bites you. Suppose the user
says "I lent Tich 200." Semantically that's **one event** — money left the
wallet *and* a debt now exists — but it touches two tables (`transactions`
and `debts`). The naive approach would be two separate tool calls:
`create_transaction` then `create_debt`. That's dangerous: if the first
insert succeeds and the second fails (network blip, validation error,
anything), you're left with a transaction that implies money moved but no
debt record to explain why — a silently corrupted ledger.

Penda's fix is `log_borrowed_or_lent_money`, a single tool whose handler
(`handleLogBorrowOrLend`, line 1687) calls **one** Postgres function:

```ts
const { data: rawData, error } = await ctx.supabase
  .rpc('log_borrow_or_lend', { p_wallet_id: ctx.walletId, p_direction: direction, /* ... */ })
  .single()
```

The comment above it explains the guarantee:

```ts
// Atomic multi-tool chain (roadmap bet #4): borrowing/lending needs a wallet
// transaction AND a debt to land together or not at all. Both inserts happen
// inside the log_borrow_or_lend Postgres function (see migration 0026), if
// either fails, the function raises and the whole call rolls back...
```

**The lesson generalizes**: tool calls in an agent loop are separate round
trips, each one a chance for a crash, timeout, or partial failure between
them. If two writes must succeed or fail *together*, don't rely on the model
reliably calling two tools in the right order with nothing going wrong in
between — push the atomicity down into the database as a single transaction
(a stored procedure, or a multi-statement transaction in your handler), and
expose it to the model as *one* tool. The agent loop is not a transaction
boundary; your database is.

## Read tools are just... reads

Not every tool mutates. `query_records` (line 2083) and `get_spending_summary`
(line 2178) run immediately, no confirmation, because they can't hurt
anything. `query_records` is also how the model discovers *ids* to operate
on later — notice the tool description literally tells the model to use it
first: "you MUST first find the exact record with `query_records` to get its
id" (system prompt, line 1058). The model has no other way to know a
transaction's UUID; it can only ever act on ids it has actually seen in a
tool result.

Also notice the defensive `sanitizeSearch` (line 2077) before any search term
touches a `.or()` filter — a reminder that even "just a read" needs the same
input-sanitization discipline as a mutation, because the search string still
flows into a query.

## Recap

- Tool calling = you hand the model a menu of typed functions; it emits a
  request to call one; your code decides what actually happens.
- Descriptions are the model's only instructions for *when* to use a tool —
  write them like you're disambiguating for a person, because that's
  effectively what you're doing.
- Build schema constraints (like `enum`) from live data whenever possible —
  it prevents bad values structurally instead of hoping the model behaves.
- Always re-validate arguments in the handler. The schema is a shape
  contract, not a business-rule contract.
- Handle unknown tool names and malformed arguments gracefully — feed the
  problem back into the loop instead of crashing the whole request.
- When one real-world event requires multiple table writes, don't split it
  across multiple tool calls — wrap it in one atomic DB operation and expose
  a single tool for it.

Next: [04 — Permissions, trust & safety](04-permissions-trust-and-safety.md)
