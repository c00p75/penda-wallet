# 11 — Glossary & Exercises

## Glossary

Terms you should now be able to define in your own words, with a Penda
example attached. If any of these feel shaky, the linked module has the full
story.

**LLM (large language model)** — the underlying model (Gemini, Groq's
Llama models) that turns a prompt into text or a structured response. It has
no memory of your app beyond what you put in the prompt this turn, and no
ability to act on anything except by emitting text or a tool call.

**Agent / agentic** — a system where the model doesn't just answer, it
decides which actions to take (via tool calls) and loops until it's done.
See [01](01-what-makes-an-app-agentic.md).

**Agent loop** — the cycle of "call the model → if it requested tools, run
them and feed results back → call the model again → repeat until it stops
requesting tools (or a safety ceiling is hit)." Implemented in `runAgent`,
[02](02-anatomy-of-the-agent-loop.md).

**System prompt / system instruction** — the persistent instructions handed
to the model before the conversation, setting its persona, rules, and
policies. `buildSystemInstruction` in `chat-message`, [02](02-anatomy-of-the-agent-loop.md).

**Tool calling / function calling** — giving the model a menu of named,
schema-described functions it can request to invoke; the model emits a
request, your code decides whether and how to actually run it.
[03](03-tool-calling-mechanics.md).

**Structured output** — a close cousin of tool calling where instead of
picking from a menu of functions, the *entire response* is constrained to
match a JSON Schema. Used by `receipt-vision` because the task ("extract
this receipt") has one shape, not a menu of choices. [08](08-multimodal-tools.md).

**JSON Schema** — the format used to describe a tool's parameters (or a
structured output's shape): types, required fields, and (importantly)
`enum` lists that make certain wrong answers structurally impossible rather
than just discouraged.

**Provider adapter** — the translation layer between your app's neutral
message/tool format and a specific provider's wire format (Gemini vs. Groq).
Lets you swap or fall back between providers without losing conversation
state. [02](02-anatomy-of-the-agent-loop.md), [06](06-resilience-and-reliability.md).

**Hallucination** — when a model states something false with full
confidence (a wrong total, a category that doesn't exist, a tool that was
never defined). You don't "fix" this by asking the model to be more careful;
you fix it by making the false answer structurally impossible or by
re-validating downstream (enums, `normalizeCategoryName`,
`dispatchTool`'s `default` case). [03](03-tool-calling-mechanics.md), [08](08-multimodal-tools.md).

**Guardrail** — a hard rule enforced in your code, not the model's judgment,
that some action can never happen regardless of what the model or the user
requests (deletes always need confirmation; a wallet's currency can never be
edited by the agent). [04](04-permissions-trust-and-safety.md).

**Staged action / pending action** — a proposed mutation written to a
holding table instead of applied, shown to the user as a confirm card, and
only executed by a separate, explicitly-triggered code path. `ai_pending_actions`,
[04](04-permissions-trust-and-safety.md).

**Graduated trust** — letting a user "earn" reduced friction (auto-applying
small edits) through a track record of clean confirmations, while keeping
hard floors (deletes, large money moves) that no amount of trust lifts.
`aiTrust.ts`, [04](04-permissions-trust-and-safety.md).

**Atomic operation** — a set of writes that must all succeed or all fail
together, implemented as a single database transaction/function rather than
multiple separate tool calls chained together and hoped to both succeed.
`log_borrow_or_lend`, [03](03-tool-calling-mechanics.md).

**Fail open / fail closed** — what a guardrail does when *it itself* breaks.
Fail open = let the request through anyway (used for rate limiting: a broken
limiter shouldn't take down the feature it protects). Fail closed = block
the request (used for mutation confirmation: a broken check should never
mean an unconfirmed delete goes through). [06](06-resilience-and-reliability.md).

**Idempotency** — designing an operation so running it twice has the same
effect as running it once, usually via a database uniqueness constraint
(`dedupe_key`) rather than "being careful" in application code.
[07](07-proactive-agents.md).

**Proactive agent** — code that decides, on its own schedule (a cron
trigger), whether to act or notify — no user message required.
[07](07-proactive-agents.md).

**Multimodal** — an agent step whose input isn't text: an image
(`receipt-vision`) or audio (`transcribe-voice`). [08](08-multimodal-tools.md).

**RAG (retrieval-augmented generation)** — *not used in Penda's chat agent*,
worth knowing the term anyway: fetching relevant documents/data and inserting
them into the prompt so the model can reference them, typically via a
vector/semantic search. Penda's "context gathering" step ([02](02-anatomy-of-the-agent-loop.md))
is a simpler, structured version of the same idea — fetch known rows by ID,
not a semantic search over a document store — because the data it needs
(this wallet's categories, this user's profile) is precisely queryable, not
something that needs fuzzy retrieval.

## Exercises

Do these in order; each one touches files you've now read at least once.
Use your project's normal dev loop (`npm run dev`, `npm run test:web`,
`npm run test:money-core`, `npm run test:edge` from the repo root) — no need
to deploy anything for these.

### 1. Trace one request, live (warm-up)

Add a temporary `console.log` at the top of the `for` loop in `runAgent`
([`chat-message/index.ts:311`](../../supabase/functions/chat-message/index.ts#L311))
logging `iteration` and `neutralHistory.length`. Run the app locally, send
"I lent Tich 200 for rent" in chat, and watch your function logs. Confirm you
can see: one iteration where the model emits a tool call, the tool result
appended, a second iteration where it replies in plain text. Remove the log
when you're done.

### 2. Add a new read-only tool

Add a tool called `get_upcoming_bills` that returns recurring transactions
due in the next 7 days, mirroring the shape of `get_spending_summary`
(line 1222 for the schema, `handleSpendingSummary` at line 2178 for the
handler). You'll touch: `buildTools` (add the schema), `dispatchTool` (add
the case), a new handler function, and the system prompt (mention when to
use it). Since this is a read, it needs no staging or confirmation logic —
good first tool to add. Test it by asking chat "what bills do I have coming
up?"

### 3. Write the test that's missing

Pick one pure function that doesn't currently have a test file — a good
candidate is `patchIsHighImpact` in `aiTrust.ts` ([04](04-permissions-trust-and-safety.md)).
Write a small test module covering: a single small edit (not high-impact), a
single edit over the `$1,000` threshold (high-impact), and two money fields
changing at once even if each is small (high-impact per the "two or more
fields" rule). This is the same shape as `rateLimit.test.ts` — pure input,
pure output, no mocking.

### 4. Break a guardrail on purpose, watch a test catch it

In a scratch branch (don't push this), comment out the `if (kind === 'delete')
return false` line in `mayAutoApplyMutation` (`aiTrust.ts`). Run
`npm run test:edge` and `npm run test:web`. Does anything fail? If nothing
does, that's a real gap — go back to [10](10-testing-agentic-systems.md) and
write the missing test (feed `stageDelete` a request and assert the result
always contains "Staged, NOT applied" regardless of trust level), then
confirm it fails against your broken version and passes once you revert.
This is the single best exercise for internalizing why the safety-property
tests in module 10 matter more than they might seem to at first glance.

### 5. Extend the deterministic parser

`momoParser.ts` ([05](05-business-logic-vs-agent-logic.md)) recognizes
Airtel, MTN, Zamtel, and generic bank messages. Find (or invent, based on a
real format) an SMS template it currently returns `null` for, add a test
case for it first (it should fail), then extend the regexes until it passes.
This is TDD on a genuinely deterministic piece of an AI-adjacent feature —
notice you never touch a model to do this.

### 6. Design (don't necessarily build) a new proactive agent

Sketch — on paper or in a scratch file, not necessarily shipped — a new cron
function idea: something like "notify a user if a savings goal's target date
is within 7 days but they're less than 50% funded." Answer, concretely,
using the vocabulary from [07](07-proactive-agents.md):
- What's the candidate query (who might get notified)?
- What are the independent gates before actually sending (preference
  opt-in? behavioral adaptation? quiet hours?)
- What's the dedupe key, so a retry or overlapping schedule can't
  double-notify?
- Does it need `mapLimit`, or is the candidate list always small enough that
  a plain loop is fine?

If you want to actually build it, `bill-reminders/index.ts` is the shortest
real example to copy the shape from.

### 7. Read the whole chat-message file, cold

Now that you've been walked through it in pieces across ten modules, open
[`supabase/functions/chat-message/index.ts`](../../supabase/functions/chat-message/index.ts)
top to bottom in one sitting, no guide this time. Anywhere you get
surprised or confused, that's a signal for which module to reread — and if
you find something this course didn't explain well, that's worth noting for
next time you extend this file yourself.

---

That's the series. You now have the vocabulary and the mental models to read
any part of Penda's AI surface and understand not just *what* it does, but
*why* it's built that way — and, more usefully, the judgment to make the
same kinds of decisions the next time you extend it.

Back to [00 — Start here](00-start-here.md)
