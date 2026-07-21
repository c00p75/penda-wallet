# 08 — Multimodal Tools

So far every agent interaction started as text. Two of Penda's surfaces start
somewhere else: a photo (`receipt-vision`) and an audio clip
(`transcribe-voice`). This module covers what changes — and, just as
importantly, what *doesn't* — when the input isn't text.

## Voice: the simplest possible multimodal step

Read all of
[`supabase/functions/transcribe-voice/index.ts`](../../supabase/functions/transcribe-voice/index.ts)
— it's 89 lines, and the AI part is one `fetch` call to Groq's Whisper
endpoint, forwarding the uploaded audio file and returning whatever text
comes back:

```ts
const groqForm = new FormData()
groqForm.append('file', audio, audio.name || 'audio.webm')
groqForm.append('model', GROQ_WHISPER_MODEL)
const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', ... })
const data = await res.json()
return respond({ transcript: data.text ?? '' })
```

That's it. **This function does no interpretation at all.** It doesn't try
to decide "is this a transaction, a question, a debt." It converts audio to
text and stops. The transcript then gets handed to the client, which sends
it into `chat-message` as an ordinary text message — the exact same
conversational agent from modules [02](02-anatomy-of-the-agent-loop.md)–[04](04-permissions-trust-and-safety.md)
does the actual reasoning. This is a composability lesson worth keeping: you
don't need a separate "voice agent" that duplicates all of chat's tool-calling
logic. You need one dumb, narrow conversion step (speech → text) that feeds
your one real agent. Build the hard part once.

### A monetization decision that changes which guardrail carries the weight

The comment above `VOICE_RATE_LIMITS` is unusually candid about a product
decision shaping the code:

```ts
// Voice is the free hero (roadmap bet 9): the most demo-able interaction is
// ungated. Depth (insights history, unlimited members, receipts) monetises
// instead, so no entitlement check here. Rate limiting is the cost guard
// an entitlement gate would otherwise have provided (audit finding).
```

Voice costs real money per call (Whisper isn't free) exactly like vision
does below — but the product wants voice to be frictionless for everyone, so
there's no premium-tier gate. That just means the *other* guardrail,
rate-limiting, has to carry the entire cost-control burden alone here,
instead of sharing the job with an entitlement check. Whenever a cost-bearing
feature isn't gated by tier, ask explicitly: what guardrail is doing that job
instead, and is it actually sized for that? (`VOICE_RATE_LIMITS` allows 30
bursts / 300 a day — looser than chat's 20/200, because "a single utterance
is cheap" per the comment right above it, but still a real ceiling, not "no
limit.")

## Vision: from a photo to a structured object

[`supabase/functions/receipt-vision/index.ts`](../../supabase/functions/receipt-vision/index.ts)
takes a receipt photo and returns a fully-formed draft transaction, line
items included. The mechanism is **structured output**, a close cousin of
the tool-calling you learned in [03](03-tool-calling-mechanics.md) — same
idea (constrain what the model can say to a JSON Schema), different API
shape (there's no "tool" here, just a schema the whole response must match):

```ts
const response = await genAI.models.generateContent({
  model: GEMINI_MODEL,
  contents: [{ role: 'user', parts: [
    { inlineData: { mimeType, data: base64 } },              // the image, base64-encoded
    { text: `Extract the details from this receipt photo...` },  // the instruction
  ]}],
  config: { responseMimeType: 'application/json', responseSchema: EXTRACTION_SCHEMA },
})
```

`EXTRACTION_SCHEMA` (line 59) shapes exactly what comes back: `merchant`,
`transaction_date`, `total_minor`, `items[]` each with `description`,
`amount_minor`, `suggested_category` — and the schema's own field
descriptions do real instructional work ("Line total in cents, not unit
price," "Exclude TOTAL, TAX, CASH, CHANGE, subtotal, and payment rows"). This
is the same lesson as [03](03-tool-calling-mechanics.md)'s tool
descriptions: **the schema isn't just a shape constraint, it's where you put
the instructions the model actually needs to get the extraction right.**

### Same fallback pattern, reused for a completely different kind of call

```ts
async function extractReceipt(base64, mimeType, categories) {
  try {
    return await extractWithGemini(base64, mimeType, categories)
  } catch (error) {
    console.error('Gemini vision failed, falling back to Groq:', error)
    return await extractWithGroq(base64, mimeType, categories)
  }
}
```

The exact same "try the primary provider, fall back to the secondary" shape
from [06](06-resilience-and-reliability.md), applied to vision instead of
chat. Notice Groq's version can't use a strict schema parameter the way
Gemini's `responseSchema` does — it just describes the exact JSON shape in
the prompt text and sets `response_format: { type: 'json_object' }` — a
reminder that "structured output" support varies in strictness across
providers, and your fallback path has to work with the *weaker* guarantee,
not assume both providers enforce the schema equally well.

### Structured output still isn't gospel — validate anyway

Even with a schema, `suggested_category` is typed as a plain string, not an
enum constrained to this wallet's actual categories (unlike `create_transaction`'s
tool schema in [03](03-tool-calling-mechanics.md), which used `enum:
categoryNames`). Vision models describing an image in the moment can't
always be handed a hard enum the same way a text tool call can, so the code
compensates after the fact with `normalizeCategoryName` (line 289):

```ts
function normalizeCategoryName(value, allowed) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const exact = allowed.find((name) => name === trimmed)
  if (exact) return exact
  const lower = trimmed.toLowerCase()
  return allowed.find((name) => name.toLowerCase() === lower) ?? null   // case-insensitive fallback
}
```

If the model says "food" but the wallet's category is actually named "Food,"
this still matches it correctly; if the model invents a category that
doesn't exist at all, it resolves to `null` (uncategorized) rather than
silently creating a phantom category or crashing. **The tighter you can make
a constraint structurally (an `enum` in a tool schema), the less
after-the-fact cleanup you need. Where you can't (free-text extraction from
an image), budget for a normalization pass and a safe default, always.**

### A softer version of the confirmation pattern

Module [04](04-permissions-trust-and-safety.md) staged risky *edits* in a
holding table (`ai_pending_actions`), executed only after an explicit user
tap. A receipt scan is a **create**, which the CRUD policy already treats as
low-risk — so it's allowed to insert the transaction immediately, no holding
table needed. But an AI reading a slightly blurry receipt photo is less
reliable than a user typing an exact amount, so the row is tagged
`user_confirmed: false` at insert time (line 203). Same underlying goal as
staging — "let the user review this before it's treated as final" — but a
different mechanism, because the risk profile is different: a wrong *create*
is just an extra row to edit or delete, so a lightweight draft flag on the
row itself is enough; it doesn't need a whole separate confirm/execute
function pair the way a destructive edit does.

### Ordering an entitlement check around an unreliable call

```ts
// Claim runs before vision so a failed AI call still consumes the free preview.
const { data: canScan } = await supabase.rpc('claim_receipt_scan_preview', { p_user_id: user.id })
if (!canScan) return respond({ error: 'premium_required', ... }, 402)
const limitMessage = await checkRateLimits(supabase, user.id, 'receipt-vision', RECEIPT_RATE_LIMITS)
extraction = await extractReceipt(base64, mimeType, categories)   // the expensive, unreliable step
```

The one-time free preview is consumed *before* the (expensive, sometimes
failing) vision call runs, not after a successful extraction. This is a
small but deliberate ordering choice: if claiming happened *after* a
successful scan, a user could retry a scan that "fails" for any reason
(including one they engineer) and never spend their one free use. Whenever
you gate a feature behind a limited allowance and the feature itself can
fail, decide explicitly which side of the unreliable call the accounting
happens on — it changes who bears the cost of a failure.

## Recap

- You don't need a bespoke agent per input modality. Convert the unusual
  input (audio, image) into a form your one real agent already understands,
  and let that agent do the reasoning.
- Structured output (a response schema) and tool calling (a function schema)
  are the same underlying idea — constrain what the model can say — applied
  in two different API shapes. Use whichever your provider offers for the
  call you're making.
- Schema field descriptions are instructions, not documentation — write them
  for the model, not for a future human reader.
- The tighter you can constrain a field (a true `enum`), the less
  post-processing you need; free-text extraction always needs a
  normalization + safe-default pass afterward.
- Match the confirmation mechanism to the actual risk: a full stage/execute
  split for destructive edits, a lightweight draft flag for a create that's
  merely less-trustworthy-than-usual.
- When a paid allowance guards an unreliable call, decide deliberately
  whether the allowance is spent before or after the call — it determines
  who eats the cost of a failure.

Next: [09 — Frontend integration](09-frontend-integration.md)
