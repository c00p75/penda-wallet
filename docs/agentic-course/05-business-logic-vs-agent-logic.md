# 05 — Business Logic vs. Agent Logic

New agent-builders tend to make one mistake over and over: **asking the LLM
to do things that deterministic code does better.** Sums, currency
conversion, atomic multi-table writes, authorization checks — none of these
should be the model's job. The model's job is to figure out *intent*: which
tool to call, with what arguments. Everything after that should be regular,
boring, testable code.

This module is about where Penda draws that line, and why it draws it there.

## Rule of thumb: if it needs to be *exactly right*, it's not the model's job

An LLM is a language model — it's extremely good at "does this text describe
borrowing money," and structurally incapable of guaranteeing "sum these 4,000
transactions with zero error." Ask it to do the first; never ask it to do the
second.

You've already seen one instance of this in [03](03-tool-calling-mechanics.md):
`log_borrow_or_lend` is a single Postgres function
([`migrations/0026_atomic_borrow_lend.sql`](../../supabase/migrations/0026_atomic_borrow_lend.sql)),
not two separate tool calls glued together by hoping the model calls them in
the right order. Here are three more places the same instinct shows up.

## 1. Money is an integer, not a float — and the conversion is one honest function

[`packages/money-core/src/money.ts`](../../packages/money-core/src/money.ts)
is two functions, four lines of real code:

```ts
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100)
}
export function fromMinorUnits(amountMinor: number): number {
  return amountMinor / 100
}
```

Every amount in Penda's database is stored as an **integer number of cents**
(`amount_minor`), never a floating-point dollar amount. This dodges a classic
bug class: `0.1 + 0.2 !== 0.3` in IEEE 754 floating point, so summing dollar
amounts directly will eventually produce off-by-a-cent totals. Storing
`amount_minor` as an integer sidesteps the whole problem.

Why this belongs in this module: the model outputs a normal decimal number
("12.50") because that's how humans talk about money in a chat message. The
conversion to minor units happens in a **tiny, pure, tested function** the
model never sees or touches (`Math.round(amount * 100)` right in
`handleCreateTransaction`, [`chat-message/index.ts:1598`](../../supabase/functions/chat-message/index.ts#L1598)).
The model's job stopped at "the user said 12.50"; a one-line deterministic
function's job is "store that exactly." This same helper is published from
`@penda/money-core` and imported by both the web app and the edge functions
— one implementation of "how minor units work," not a copy pasted into every
place that touches money.

## 2. Don't call an LLM when a regex will do

[`packages/money-core/src/momoParser.ts`](../../packages/money-core/src/momoParser.ts)
parses mobile-money SMS text ("You have sent K1,250.00 to Jane's Shop...")
into a structured draft transaction — **without calling any AI provider at
all.** It's regexes: `AMOUNT_RE`, `EXPENSE_RE`/`INCOME_RE`, a merchant
extractor, a reference-number extractor. Read its own doc comment:

```ts
/**
 * Deterministically parse a mobile-money / bank SMS into a draft transaction.
 * Returns null when the text carries no clear amount + direction, so callers
 * can fall back to the AI parser for unrecognised formats.
 */
```

This is a deliberate architecture choice: **try the cheap, fast, deterministic
path first; only reach for the LLM when it can't handle the input.** Most
mobile-money messages from MTN, Airtel, and banks follow a handful of
predictable templates — a regex parses them instantly, for free, with zero
chance of hallucinating a wrong amount. Only genuinely unrecognizable text
formats need to fall through to an actual model call. If you're building an
agentic app and you notice yourself reaching for "just ask the LLM to parse
this," pause and ask whether a plain parser handles the 90% case — it'll be
faster, cheaper, and more predictable, and you only need the LLM for the
tail.

## 3. Aggregation belongs in the database, not in application code

This one comes with a real bug story. Read the comment at the top of
[`migrations/0036_spending_summary_rpc.sql`](../../supabase/migrations/0036_spending_summary_rpc.sql):

```sql
-- Audit finding: the tool pulled up to 1000 raw transaction rows into the
-- edge function and summed them in JS — silently WRONG past 1000 rows (a
-- heavy user asking "what did I spend this year?" got a truncated total with
-- no warning) and needlessly heavy on data transfer. Aggregate in SQL
-- instead: exact at any volume, one row out.
```

The `get_spending_summary` tool used to fetch up to 1,000 raw rows and sum
them with a JS loop. For a heavy user with more than 1,000 transactions in
the requested range, the total was **quietly wrong** — no error, no warning,
just a smaller number than reality. The fix, `get_wallet_spending_summary`,
does the `sum(...) filter (...)` directly in Postgres and returns one small
JSON object. The lesson generalizes past this one bug: **whenever a tool
needs a total, a count, or a "top N," compute it in the database, not by
pulling rows into the function that's also juggling an LLM conversation.**
The database is exact at any volume; a hand-rolled JS reduce over a
page-limited fetch is a silent landmine.

Notice also the security note in that same file: `get_wallet_spending_summary`
runs as `security invoker` (Postgres's default) rather than `security
definer`, specifically so Row Level Security still applies — the function
runs *as the calling user*, so a non-member of the wallet gets zeros back
automatically, no extra check needed in the function body. Compare that to
`log_borrow_or_lend`, which **is** `security definer` and therefore has to
do its own explicit `if not is_wallet_member(p_wallet_id, 'editor') then raise
exception ...` check (line 33) — because a `security definer` function runs
with the *owner's* privileges, bypassing RLS, so it must re-implement the
authorization check RLS would otherwise have given it for free. Choosing
between these two isn't AI-specific, but it matters a lot here: **agent
tools are an unusually direct path from "text a user typed" to "a database
call," so getting authorization boundaries right around them matters more,
not less.**

## 4. Related, but not atomic on purpose

Contrast `log_borrow_or_lend` (must be atomic — see [03](03-tool-calling-mechanics.md))
with `apply_money_habits` (deliberately **not** atomic with the transaction it
augments). Look at how `handleCreateTransaction` calls it
([`chat-message/index.ts:1613`](../../supabase/functions/chat-message/index.ts#L1613)):

```ts
let habits: Array<{ kind: string; amount_minor: number; goal_id?: string }> | undefined
try {
  const { data: habitRaw } = await supabase.rpc('apply_money_habits', { p_transaction_id: data.id })
  /* ...collect habits.contributions if applied... */
} catch {
  // Habits are additive; transaction already saved.
}
```

Round-up and pay-yourself-first savings are a *bonus* triggered by a
transaction, not part of the same real-world event. If the habits function
fails, the comment is explicit about the intended behavior: the transaction
the user actually asked to log **must not be lost or rolled back** because a
side quest failed. This is the opposite lesson from `log_borrow_or_lend`, and
knowing which one applies is a design decision every time you wire two
writes together:

- **Two writes describe one real-world event** (money moved *and* a debt was
  created by the same sentence) → they must succeed or fail together → one
  atomic DB function.
- **One write triggers an optional enhancement** (a transaction *might*
  trigger a savings habit) → the core write must survive even if the
  enhancement fails → separate call, contained failure, `try`/`catch`.

## 5. One allowlist, shared everywhere it's needed

You met `CRUD_DOMAINS` (in `chat-message`) and `DOMAIN_TABLES` (in
`executePendingAction`) in [04](04-permissions-trust-and-safety.md) as two
independent copies of "what the agent may edit," kept in sync on purpose for
defense in depth. There's a third copy, and it has a different job:
[`packages/shared-types/src/undoLogic.ts`](../../packages/shared-types/src/undoLogic.ts)
exports its own `DOMAIN_TABLES` plus pure functions like `canUndoAiAction`
and `buildReinsertRow` — imported by the **frontend**, not an edge function.
Its comment says the same thing as the others: *"Keep column lists in sync
with the edge function execute path."*

The distinction matters: the two edge-function copies are **enforcement** —
if they disagree, a write gets rejected or filtered, safely. This
shared-types copy is **UX** — `canUndoAiAction` decides whether to even show
an Undo button for a given past action. If it's wrong, nothing dangerous
happens; you just show (or hide) a button incorrectly. Same-looking
allowlist, three copies, but two very different jobs depending on which side
of the trust boundary it's standing on. When you notice similar-looking
logic duplicated across your own codebase, ask this same question before
merging it into one shared module: *is every copy doing the same job, or do
some enforce and others just render?*

## Recap

- The model decides intent (which tool, which arguments); deterministic code
  computes anything that has to be exactly right (money, totals, atomic
  writes, authorization).
- Store money as integers; convert with one small, tested, shared function.
- Prefer a fast deterministic parser over an LLM call whenever the input is
  regular enough — save the model for the genuinely ambiguous cases.
- Aggregate in the database, not by pulling rows into the same process
  that's also running your agent loop.
- Decide, per relationship between two writes, whether they must be atomic
  (one real event) or must be independently failure-tolerant (an optional
  side effect) — don't default to either.

Next: [06 — Resilience & reliability](06-resilience-and-reliability.md)
