# 06 — Resilience & Reliability

Treat every LLM provider call the way you'd treat a flaky third-party
payments API: it can be slow, it can be down, it can return something
malformed, and none of that is in your control. What *is* in your control is
how gracefully the rest of the system absorbs that. This module is a tour of
every place `chat-message` assumes something will eventually go wrong, and
what it does instead of crashing.

## Failure mode 1: the provider hangs

A network call with no timeout is a promise to wait forever. `withTimeout`
([`chat-message/index.ts:457`](../../supabase/functions/chat-message/index.ts#L457))
is a small, reusable wrapper:

```ts
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ])
}
```

`Promise.race` between the real call and a timer that always rejects — the
first one to settle wins. Every model call is wrapped in this
(`MODEL_TIMEOUT_MS = 12_000`, line 34), so a stalled Gemini request can never
leave the user staring at "Thinking…" forever; after 12 seconds it's treated
as a failure and handled by the next layer.

## Failure mode 2: the provider is down or errors out — fall back

`callModel` (line 464) tries Gemini first; on **any** failure (timeout or
otherwise) it falls back to Groq:

```ts
try {
  return await withTimeout(callGemini(history, systemInstruction, tools), MODEL_TIMEOUT_MS, 'Gemini')
} catch (error) {
  console.error('Gemini call failed, falling back to Groq:', error instanceof Error ? error.message : String(error))
  return await withTimeout(callGroq(history, systemInstruction, tools), MODEL_TIMEOUT_MS, 'Groq')
}
```

This is only possible because of the neutral message format from
[02](02-anatomy-of-the-agent-loop.md) — the conversation history isn't
"Gemini's history," it's a provider-agnostic shape either adapter can consume.
Without that abstraction, falling back mid-conversation would mean somehow
translating Gemini's proprietary history format into Groq's, which is a much
harder and more fragile problem. **If you want a fallback provider, design
your data model so no state is ever locked into one provider's shape.**

## Failure mode 3: the loop itself could run forever

Two independent ceilings, for two different runaway scenarios:

- `MAX_TOOL_ITERATIONS = 4` (line 32): caps how many *times* the model can
  call tools in one turn, in case a confused model gets stuck calling tools
  without ever producing a final answer.
- `TURN_BUDGET_MS = 40_000` (line 39): caps *wall-clock time* across the
  whole turn, so that even four legitimate but slow iterations (each
  potentially hitting a 12s timeout on Gemini and then falling back to a slow
  Groq) can't stack up to minutes. The comment spells out the exact math that
  justified the number: "timeout × two providers × four iterations" was the
  worst case before this existed.

Both failures degrade to the same safe outcome: an apologetic reply
("Could you try rephrasing?") instead of a hung request or a 504 from the
gateway. **Always give a loop an exit condition that isn't "the happy path
eventually finishes."**

## Failure mode 4: one tool call throws

A single failing tool must not take down the whole turn — especially not
mid-way through a multi-tool-call turn, where killing the request could
leave things ambiguous. Look at the `try`/`catch` around `dispatchTool` (line
356):

```ts
try {
  summary = await dispatchTool(ctx, call.name, call.args)
} catch (err) {
  console.error(`Tool ${call.name} threw:`, err instanceof Error ? err.message : String(err))
  summary = `Tool "${call.name}" failed: ${err instanceof Error ? err.message : 'unknown error'}. Nothing was saved for this step. Do not claim it succeeded.`
  threw = true
}
```

The failure becomes a **tool result string fed back into the conversation**,
not a thrown exception that bubbles up and 500s the request. The model sees
its own tool call failed and can react — apologize, try a different
approach, or ask the user for clarification — instead of the user just
seeing a blank error. Notice the explicit instruction baked into the failure
string itself ("Do not claim it succeeded") — you can't fully trust a model
to infer "this failed, so I shouldn't say it worked" from a stack trace; say
it in plain words instead. Also notice what's logged versus what's shown: the
full error goes to `console.error` (for you to debug later); only a generic
message reaches the model and, eventually, the user. A raw database error can
echo column names or even row values — treat error *messages*, not just error
*data*, as something to sanitize before it reaches an untrusted surface.

## Failure mode 5: the provider replies with garbage

Groq (or any provider) can occasionally emit a tool call whose arguments
aren't valid JSON. `callGroq` (line 584) doesn't let that exception escape:

```ts
const toolCalls = (message.tool_calls ?? []).map((call) => {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(call.function.arguments || '{}')
  } catch {
    console.error(`Groq returned malformed tool args for ${call.function.name}:`, call.function.arguments)
  }
  return { id: call.id, name: call.function.name, args }
})
```

One malformed call degrades to an empty-args call for *that call only* — the
rest of the response (other tool calls, any text) is unaffected. The comment
above this in the source is blunt about why this matters: this is the
*fallback* provider, so nothing else catches a crash here — if this `JSON.parse`
were allowed to throw, it would take down the one path that's supposed to be
the safety net for when the primary provider already failed.

## Failure mode 6: cost and abuse

An agent that can call an expensive model on every keystroke is also a
standing bill and an abuse surface. `checkRateLimits`
([`_shared/rateLimit.ts`](../../supabase/functions/_shared/rateLimit.ts)) runs
*before* any model call:

```ts
const CHAT_RATE_LIMITS = {
  burst: { maxRequests: 20, windowMinutes: 5 },
  daily: { maxRequests: 200, windowMinutes: 60 * 24 },
}
```

A tight burst window stops a runaway client-side loop from hammering the
model; a loose daily cap bounds worst-case cost per account. Look at how the
check itself is written to fail:

```ts
if (error) {
  console.error(`Rate limit check failed for ${endpoint}, failing open:`, error.message)
  return true   // <- fails OPEN
}
```

This is a deliberate, named choice — **fail open**, not fail closed. If the
rate-limit database call itself errors, the limiter lets the request through
rather than blocking it. Compare that to the confirmation guardrails in
[04](04-permissions-trust-and-safety.md), which fail *closed* — a broken
check there means "don't apply the mutation." The difference is about what a
false negative costs: a broken rate limiter momentarily allowing extra chat
requests is an annoyance; a broken confirmation check silently allowing an
unconfirmed delete is a disaster. **Decide fail-open vs. fail-closed per
guardrail, based on what happens when the guardrail itself is the thing
that's broken — never adopt one default for everything.**

`receipt-vision` applies the same idea even more pointedly — its own comment
explains that vision calls are the single most expensive request in the app
(image tokens aren't cheap), and it used to rely on a premium-tier gate
*alone*, with no per-user cap — meaning one compromised or careless premium
account could run up unbounded spend. The fix was the same `checkRateLimits`
helper, reused rather than reinvented.

## Failure mode 7: the user is mid-stream when something pivots

Streaming (SSE) sends partial text to the client as the model generates it —
but if the model starts narrating and then pivots into a tool call
mid-sentence, that partial narration usually isn't the real final answer.
`onReset` (line 340, wired to the `reset` SSE event) tells the client to
throw away what it's shown so far:

```ts
if (turn.text) hooks?.onReset?.()
```

This is a small UX-reliability detail with a real principle behind it:
**streaming introduces a new failure mode that a non-streaming request never
has** — showing the user something that turns out to be wrong or incomplete
mid-flight. If you stream, you need an explicit "never mind, that wasn't
final" signal, not just hope the model never second-guesses itself.

## The outermost net

Finally, the whole handler is wrapped in one more `try`/`catch` (line 208 and
445): any unhandled exception anywhere in the request returns a generic
`{ error: 'Something went wrong on our side. Please try again.' }` with a
500, while the *real* error is logged server-side only. No matter how many
specific safety nets exist above, the outermost layer assumes it missed one,
and never lets a raw internal error message reach the client.

## Recap

- Timeout every external call; a hang with no timeout is an unbounded wait.
- Design your data model so a fallback provider is actually possible — no
  state locked into one provider's proprietary shape.
- Cap both iteration count *and* wall-clock time; they fail differently.
- A single tool failure should degrade to a message the model can react to,
  not an exception that kills the whole turn.
- Never let a malformed response from a provider crash the code whose entire
  job is being the fallback for when the other provider already failed.
- Choose fail-open vs. fail-closed per guardrail, based on the cost of that
  specific guardrail being wrong — not as one blanket policy.
- Log full error detail server-side; only ever return sanitized, generic
  messages to the client.

Next: [07 — Proactive agents](07-proactive-agents.md)
