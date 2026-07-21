# 10 — Testing Agentic Systems

Here's the question that trips people up first: **the model is
non-deterministic — ask it the same thing twice and it might phrase the
answer differently, or even pick a different tool. So what do you actually
write a test for?**

The answer Penda's codebase lands on: **you don't test the model. You test
everything around it** — and you design the code so that "everything around
it" is almost all of it. This module is about that split, with real test
files as evidence.

## The rule: pull pure logic out, test that; leave the model call thin

This is a direct, standing convention (captured in this project's own notes
while it was being built):

> put the *pure logic* of each feature in its own module (parsers,
> projections, suggestion/pacing/simulation algorithms) and test that; UI is
> thin wiring on top.

You've already met the payoff of this in earlier modules without necessarily
noticing it was also a *testing* decision:

- [`momoParser.ts`](../../packages/money-core/src/momoParser.ts) ([05](05-business-logic-vs-agent-logic.md))
  is pure input-in, structured-output — no network call, no database, no
  model. [`momoParser.test.ts`](../../packages/money-core/src/momoParser.test.ts)
  can therefore assert exact output for exact input, no mocking required:

  ```ts
  it('parses an Airtel Money send as an expense', () => {
    const r = parse('Txn ID PP240714.1523.C12345 Confirmed. You have sent K250.00 to JOHN MULENGA...')
    expect(r!.provider).toBe('airtel')
    expect(r!.type).toBe('expense')
    expect(r!.amountMinor).toBe(25000)
    expect(r!.merchant).toBe('JOHN MULENGA')
  })
  ```

  This is a real regression suite for a real parser, and it never touches an
  LLM — reinforcing the [05](05-business-logic-vs-agent-logic.md) lesson
  that this deterministic path exists specifically so you *have* something
  this cleanly testable for the common case, instead of "we can't really
  test the SMS parsing, it's all AI."

- [`rateLimit.test.ts`](../../supabase/functions/_shared/rateLimit.test.ts)
  tests exactly the pieces of `rateLimit.ts` that are pure functions —
  `rateLimitEndpointKey`, `rateLimitExceededMessage` — and pointedly does
  **not** test `checkRateLimits` itself, because that function's whole job
  is calling a database RPC. Splitting the file this way (pure string/logic
  helpers vs. a thin async function that calls out) means the part that
  *can* be tested cheaply and reliably is separated from the part that would
  need a real or mocked Supabase client to exercise at all.

- `undoLogic.ts` and `companionRitualGating.ts` follow the identical shape:
  the *decision* ("is this action undoable," "should this ritual fire
  today") is a pure function taking plain data in and returning a plain
  answer out, tested directly, with the actual database/notification
  plumbing kept in a thin caller that isn't unit-tested at this layer.

**The pattern to copy**: before you write a feature that involves an
agent/AI call, ask "what part of this is actually a decision or
transformation I can express as `(input) => output`, with no network call
inside it?" Write that part as its own function, and test *that* exhaustively.
Whatever's left — the actual `fetch` to Gemini/Groq, the actual DB write — is
usually thin enough that it doesn't need (or can't usefully have) a unit
test; it needs the integration/manual verification covered later in this
module.

## Testing the *safety property*, not the model's wording

You can't assert "the model always phrases a staged edit as a question." You
absolutely can, and should, assert "the UI never says a staged edit is done
until the user confirms it" — that's a property of *your* code, not the
model's. Look at
[`ChatSheet.test.tsx`](../../apps/web/src/features/chat/ChatSheet.test.tsx):

```ts
describe('ChatSheet staged edit/delete confirmation', () => {
  it('shows a confirm card when the reply stages an update, and does not claim it is done', async () => { ... })
  it('applies the change only when the user confirms', async () => { ... })
  it('does not apply the change when the user cancels', async () => { ... })
})
```

These tests don't call a real model. They stub a server response shaped like
a staged action (a fake `pendingActions` payload, the same shape
`chat-message` would produce) and assert on what the *client* does with it —
renders a card, doesn't apply anything until "confirm" is clicked, actually
calls confirm only then. This is exactly how you should think about testing
the guardrails from [04](04-permissions-trust-and-safety.md): the guarantee
"the model can't execute a delete on its own" is a fact about your dispatcher
and your UI wiring, so test *that* code directly with a fake payload, rather
than trying to coax a real model into attempting a delete and checking it
didn't happen. The same applies server-side: you could (and should, if you
haven't) write a test that feeds `dispatchTool` a `delete_record` call and
asserts the return is always a "staged, not applied" string, never a real
delete — again, no model involved, just verifying your own dispatcher's
contract.

## Two runtimes, tested with their own native tools

Look at the root [`package.json`](../../package.json) scripts:

```json
"test:web": "npm run test --workspace=apps/web",
"test:money-core": "npm run test --workspace=@penda/money-core",
"test:edge": "deno test --allow-env supabase/functions/_shared"
```

The web app and `money-core` package run on Node, tested with Vitest. Edge
functions run on Deno, and their shared logic (`rateLimit.ts`, `aiTrust.ts`,
`companionRitualGating.ts`, etc.) is tested with **Deno's own built-in test
runner** (`Deno.test(...)`, `assertEquals` from Deno's standard library) —
not Vitest pretending to be Deno. Don't force one test runner to understand
two different runtimes; let each piece of code be tested by the tool that
actually understands its environment.

Two environment gotchas worth knowing before you hit them yourself (both
were hard-won while building this):

- Running `deno check` (Deno's typechecker, used to sanity-check an edge
  function before deploy) rewrites this repo's `node_modules` into Deno's
  own module layout as a side effect — which then breaks `vitest run` in
  confusing ways (duplicate React errors, jest-dom matchers silently missing)
  that don't obviously point back to "I ran deno check earlier." The fix, if
  it happens, is `npm ci` at the repo root (a plain `npm install` isn't
  enough — it sees no lockfile diff and leaves the corrupted files in
  place), then re-running the *full* `vitest run`, not just the file you were
  working on, to confirm nothing else silently broke.
- A single-file `vitest run` can fail to resolve a newly-added `@/` import
  path due to a stale Vite cache; clearing
  `apps/web/node_modules/.vite` and `.vitest` fixes it.

Neither of these is really about AI — they're the ordinary cost of a
multi-runtime monorepo — but they're exactly the kind of thing that eats an
afternoon if you don't know it's a known, already-solved problem.

## What's left untested by design, and how that gap gets covered instead

Nothing in this test suite verifies "Gemini correctly decides to call
`log_borrowed_or_lent_money` instead of `create_transaction` when the user
says X." That's a real gap, and it's an *intentional* one — asserting on a
live model's exact behavior is flaky (models get updated upstream, outside
your control) and slow/costly to run in CI. Where this project has to trust
the model's actual judgment, it relies on manual verification against a real
running app (see this project's own [verify skill](../../.claude) conventions
if you're curious how that's organized) rather than an automated assertion.
Know which category a given piece of behavior falls into: **"does my code do
the right thing with whatever the model said" is unit-testable and should be
tested exhaustively; "does the model say the right thing" is not, and
belongs to manual/integration verification instead.**

## Recap

- Pull the pure decision/transformation logic out of every AI-adjacent
  feature into its own function; test that function directly and
  exhaustively.
- Don't unit-test the thin wrapper that just calls the database or the model
  provider — there's nothing deterministic to assert there.
- Test your *safety properties* (never auto-apply a delete, always show a
  confirm card for a staged edit) against stubbed data shaped like a real
  response — you're verifying your own dispatcher and UI, not the model.
- Let each runtime (Node/Vitest, Deno/`Deno.test`) be tested by its own
  native tool instead of forcing one test runner across a polyglot monorepo.
- Know the difference between "my code's reaction to the model's output" (
  test this) and "the model's actual judgment call" (verify this manually,
  don't pretend a flaky assertion covers it).

Next: [11 — Glossary & exercises](11-glossary-and-exercises.md)
