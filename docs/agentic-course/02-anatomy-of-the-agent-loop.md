# 02 — Anatomy of the Agent Loop

Every agentic system, no matter how fancy, boils down to this loop:

```
ask the model to think/act → did it call a tool?
    yes → run the tool → feed the result back → ask again
    no  → it's done, show the reply
```

This module walks that loop as it's actually implemented in
[`supabase/functions/chat-message/index.ts`](../../supabase/functions/chat-message/index.ts),
from the moment a request arrives to the moment a reply goes back.

## Step 0: before the model is even called

Look at the top of the `Deno.serve` handler (line 201 onward). Before any AI
happens, the function:

1. Validates there's an `Authorization` header and resolves it to a real user
   (`supabase.auth.getUser(token)`) — line 214-226.
2. Runs `checkRateLimits(...)` (line 231) — a cost/abuse guard, covered in
   [06](06-resilience-and-reliability.md).
3. Validates the request body: `walletId` and `message` are required, and
   `walletId`/`conversationId` must actually look like UUIDs (line 236-248) —
   this matters because `walletId` gets interpolated into a Postgres filter
   later; rejecting non-UUIDs at the door is a small but real security habit
   (never trust a client-supplied string that's about to touch a query).

None of this is "AI" — it's the same boring-but-essential validation any API
endpoint needs. **Agentic systems don't get to skip the fundamentals**; if
anything they need more of them, because a compromised or buggy request now
has an LLM as an accomplice.

## Step 1: gather context, in parallel

```ts
const [history, categories, rules, profile, memories, currency] = await Promise.all([
  fetchHistory(supabase, conversationId),
  fetchCategories(supabase, body.walletId),
  fetchCategorizationRules(supabase, body.walletId),
  fetchProfile(supabase, user.id),
  fetchMemories(supabase, user.id),
  fetchWalletCurrency(supabase, body.walletId),
])
```
(line 252-259)

This is the model's entire world for this turn: conversation history, what
categories exist, any "always categorize Uber as Transport" rules the user
taught it, their profile (persona, goals), long-term memories, and which
currency to speak in. An LLM has **no built-in knowledge of your app's data**
— every fact it can act on has to be fetched and handed to it explicitly.
Notice these six fetches don't depend on each other, so they run concurrently
with `Promise.all` instead of one after another — a plain performance habit
that matters more here because the user is staring at a "Thinking…" indicator
for every millisecond this takes.

## Step 2: build the two things the model needs

**Tools** — `buildTools(categories)` (line 261, defined at line 1095) returns
a list of JSON-Schema-described functions the model is *allowed to call*:
`create_transaction`, `query_records`, `delete_record`, and so on. This is the
model's entire vocabulary of possible actions — if it's not in this list, the
model literally cannot do it. Module [03](03-tool-calling-mechanics.md) is
entirely about this list.

**System instruction** — `buildSystemInstruction(...)` (line 263, defined at
line 992) builds the prompt that sets the model's persona, house rules
("never use an em dash"), currency formatting rules, and the CRUD policy
("update stages a change, delete always needs confirmation"). Read the
comment right above the `return` at line 1082:

```ts
// Volatile context (current page, today's date) goes LAST: everything above
// it is stable across a user's requests, so Gemini's implicit prefix
// caching can reuse it. With the page line mid-prompt, every navigation
// invalidated the cached prefix from that point down (audit finding).
```

This is a real lesson, not a style nitpick: LLM providers cache the *prefix*
of a prompt that repeats across calls, so they don't re-process it (and don't
re-bill you for it) every time. If you bury something that changes on every
single request (today's date, the current screen) in the *middle* of an
otherwise-stable prompt, you silently defeat that caching for every token
after it. Structure prompts like a layered cake: stable stuff first, volatile
stuff last.

## Step 3: the loop itself

This is the heart of it — `runAgent` (line 308), specifically the `for` loop
at line 311:

```ts
for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
  if (iteration > 0 && Date.now() - turnStart > TURN_BUDGET_MS) break

  const turn = await callModel(neutralHistory, systemInstruction, tools, hooks?.onToken)

  // ...append the assistant's message (text + any tool_calls) to history...

  if (turn.toolCalls.length === 0) {
    return { conversationId, reply: turn.text, ... }   // done — no tools called
  }

  // ...run every tool call, collect results...
  // ...append a tool-result message to history...
}
// loop exhausted MAX_TOOL_ITERATIONS without a final answer:
return { reply: "Sorry, I'm having trouble completing that one...", ... }
```

Walk through what this means concretely for "I lent Tich 200 for rent":

1. **Iteration 0**: model reads the message, decides this is a two-sided
   event, emits a tool call `log_borrowed_or_lent_money({...})`. No text yet.
2. The function runs that tool (`dispatchTool`, line 357), gets back a result
   string like `"Logged 200 to Tich, debt recorded"`.
3. That result is appended to history as a `tool_result` message — **from the
   model's point of view, its own tool call and the outcome are now part of
   the conversation it can reason about**.
4. **Iteration 1**: the model is called again, this time it can see the tool
   succeeded, and it emits *no* tool calls, just text: `"Got it, logged 200
   to Tich."` The loop sees `toolCalls.length === 0` and returns.

`MAX_TOOL_ITERATIONS = 4` (line 32) is a hard ceiling: a model that gets stuck
in a call-a-tool-forever pattern (rare, but possible with a confused model or
a bad prompt) can't hang the request indefinitely — it fails safely with an
apologetic message instead of spinning forever. `TURN_BUDGET_MS = 40_000`
(line 39) is a *wall-clock* ceiling on top of that, because four iterations
each hitting a slow provider could otherwise add up to minutes; the comment
above it spells out the exact math (timeout × two providers × four
iterations ≈ 160s worst case) that motivated adding it.

**Key idea**: a "tool call" never directly touches the database from inside
the model. The model can only *emit a request* to call a named function with
some arguments — your code decides whether and how to actually run it. That
separation is what makes the whole permission system in
[04](04-permissions-trust-and-safety.md) possible.

## Step 4: one conversation, two possible AI providers

Every message and tool exchange is stored as a `NeutralMessage` — a shape
that's neither Gemini's format nor Groq's format (defined around line 140):

```ts
type NeutralPart =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; result: string }
```

`callModel` (line 464) tries Gemini first and falls back to Groq on failure.
Each provider adapter (`toGeminiContents`, `toGroqMessages`, around lines
698–755) translates this neutral shape into that provider's specific wire
format at the last possible moment. This is why a conversation that started
on Gemini can seamlessly continue on Groq mid-conversation if Gemini has a
bad moment: **nothing provider-specific is ever persisted**. We'll dig into
why this matters in [06](06-resilience-and-reliability.md).

## Step 5: streaming vs. non-streaming

The same `runAgent` function serves two client experiences. If the caller
asks for a stream (`wantsStream`, line 305), tokens are pushed to the client
as they're generated via Server-Sent Events (`onToken`), and a `reset` event
tells the UI to discard partial text if the model pivots into a tool call
mid-sentence (`onReset`, line 340) — you don't want the user to see a
half-written sentence followed by an unrelated tool result. If not, the
function just awaits the whole result and returns JSON once. Same loop, same
tool dispatch, two different presentation layers on top. Module
[09](09-frontend-integration.md) covers the client side of this.

## Recap

- The loop is: call the model → if it asked for tools, run them and feed
  results back → repeat → stop when it replies with just text (or you hit a
  safety ceiling).
- Context (history, categories, profile, memories) has to be fetched and
  handed to the model explicitly every single turn — it has no memory of its
  own beyond what's in this prompt.
- Tool calls are *requests*, not actions — your code is always the one that
  decides what actually happens.
- Providers are swappable because every message is stored in a neutral shape
  and only converted to a provider's format at call time.

Next: [03 — Tool-calling mechanics](03-tool-calling-mechanics.md)
