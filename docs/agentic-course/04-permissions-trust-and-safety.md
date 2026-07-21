# 04 — Permissions, Trust & Safety

This is the module that separates "a fun demo" from "an app you'd trust with
your real financial ledger." The question: **the model can call
`delete_record` on any row it can find — what actually stops it from wrecking
someone's data?**

The short answer, straight from memory captured while this was being built:

> Create is low-risk (visible, fixable); updates/deletes are where a confused
> agent breaks the ledger and trust evaporates.

The permission model treats different actions completely differently based
on how bad it would be if the model got them wrong. This is a design
decision, not a framework feature — you build it yourself, and this module
shows you exactly how Penda did.

## The four-tier action model

| Action | Runs when? | Why |
|---|---|---|
| Reads (`query_records`, `get_spending_summary`) | Immediately, always | Can't damage anything |
| Creates (`create_transaction`, `create_goal`, ...) | Immediately, always | Visible and easy to undo (you can see the new row and delete it) |
| Updates (`update_record`) | Immediately **if** trusted & low-impact, otherwise staged | Could silently corrupt a record, but graduated trust makes small edits low-friction |
| Deletes (`delete_record`) | **Always** staged, no exceptions | Destructive and (for hard-deletes) unrecoverable |

"Staged" means: the tool handler does **not** touch the real table. It writes
a row into a holding table (`ai_pending_actions`) describing the *proposed*
change, and returns that to the client as a Yes/No confirmation card. Nothing
happens to real data until the user taps "Yes." This is the single most
important guardrail in the whole system, so let's trace it end to end.

## Tracing an edit: from tool call to confirm card to write

**1. The model calls `update_record`.** Handled by `stageUpdate`
([`chat-message/index.ts:2009`](../../supabase/functions/chat-message/index.ts#L2009)):

```ts
const row = await loadTarget(ctx, cfg, domain, id)         // load the current row
const { patch, diff } = buildPatch(cfg, row, changes, ...)  // validate + diff the requested changes
```

`buildPatch` (line 1873) is the allowlist gate. It walks `CRUD_DOMAINS[domain].fields`
(line 1769) — a hardcoded map of *exactly* which columns the agent may ever
touch per domain. Look at the `wallet` entry:

```ts
wallet: {
  table: 'wallets',
  softDelete: false,
  deletable: false,          // <- the agent can NEVER delete a wallet
  fields: { name: { column: 'name', kind: 'raw' } },   // <- can rename, nothing else
  describe: (row) => `the wallet "${row.name}"`,
},
```

Even if the model somehow tried to sneak `{ base_currency: 'USD' }` into
`changes`, `buildPatch` silently drops any key not present in `fields` — a
wallet's currency is structurally impossible for the agent to change, no
matter what the model asks for. This is the same idea as the JSON Schema
`enum` from [03](03-tool-calling-mechanics.md): **don't rely on the model
behaving; make the bad outcome structurally unreachable.**

**2. Decide: stage, or auto-apply?** This is where trust comes in — see the
next section. Either way, nothing lands on the real table yet without going
through `executePendingAction`, which we'll get to in step 4.

**3. If staged, insert into `ai_pending_actions` and stop.**

```ts
ctx.pendingActions.push(
  await insertPendingAction(ctx, { kind: 'update', domain, targetId: id, patch: patchWithUndo, summary }),
)
return `Staged, NOT applied: ${summary} ... Ask them to confirm; do not say it's done.`
```

Notice the tool *result* string explicitly tells the model not to claim
success. That's not decoration — it's the only lever you have over what the
model says next, and the system prompt reinforces it (line 1066: *"Do not say
it's done until applied."*). The pending row is what the client renders as
the confirm card (module [09](09-frontend-integration.md)).

**4. The user taps Yes → a *different* function executes it.** This is the
part that actually enforces the guardrail. Look at
[`confirm-ai-action/index.ts`](../../supabase/functions/confirm-ai-action/index.ts):
this is a **separate edge function** from `chat-message`. The model's tool
call ends at "write a pending-action row." The only code path that ever
calls `executePendingAction` (which does the real `UPDATE`/`DELETE`) lives
here, gated behind the user's explicit tap:

```ts
const newStatus = body.decision === 'cancel' ? 'cancelled' : 'confirmed'
const claimed = await claim(supabase, pending.id, newStatus)
...
if (body.decision === 'cancel') return respond({ ok: false, status: 'cancelled', ... })
await executePendingAction(supabase, pending)
```

**The model has no code path to a write for update/delete.** It can only ever
produce a *proposal*. This is worth sitting with: the strongest guarantee
here isn't a prompt instruction ("please ask before deleting") — prompts are
suggestions the model can misread or ignore. It's an architectural fact: the
function the model's tool calls invoke is physically incapable of writing to
`transactions`, `debts`, etc. Only a separate function, triggered by a real
user tap, can do that.

### `claim()`: a small but important concurrency detail

```ts
async function claim(supabase, id, status) {
  const { data } = await supabase
    .from('ai_pending_actions')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')   // <- only succeeds if it's STILL pending
    .select('id')
  return (data?.length ?? 0) > 0
}
```

The `.eq('status', 'pending')` on the update is an optimistic-concurrency
check: if two requests race (double-tap, offline queue replaying, two
devices), only the first one actually flips the status; the loser's update
matches zero rows and `claimed` comes back `false`. This stops a pending
action from being executed twice. Whenever you let a client trigger a
one-time state transition, ask "what happens if this request arrives twice?"
— here, the answer is "nothing, the second one just reports the same
outcome" instead of "the delete happens twice" or worse.

### A second, independent allowlist — on purpose

`executePendingAction`'s `DOMAIN_TABLES` (in
[`_shared/executePendingAction.ts`](../../supabase/functions/_shared/executePendingAction.ts))
looks a lot like `CRUD_DOMAINS` in `chat-message` — same domains, same
editable columns, same soft-delete/deletable flags. That's not accidental
duplication to clean up; the comment says it outright: *"Allowlists kept in
sync with chat-message CRUD_DOMAINS / confirm-ai-action."* Two different edge
functions each independently decide what's allowed, rather than one function
trusting a flag the other one set. If a bug ever let `chat-message` stage a
patch touching a forbidden column, `executePendingAction` still filters it
out before the `UPDATE` runs (`Object.entries(patch).filter(([column]) =>
target.columns.includes(column))`). Defense in depth: don't make the
execution boundary trust the staging boundary just because they're "supposed"
to agree.

## Graduated trust: earning the right to skip the card

Confirming every tiny edit forever would be exhausting. Penda solves this
with a trust score that grows with good outcomes, in
[`_shared/aiTrust.ts`](../../supabase/functions/_shared/aiTrust.ts):

```ts
export interface AiTrust {
  confirmed_ok: number       // successful confirms so far
  confirmed_undone: number   // times the user hit Undo after confirming
  auto_loose: boolean        // has the user "graduated" to auto-apply?
}

export const GRADUATE_THRESHOLD = 10
export const HIGH_IMPACT_AMOUNT_MINOR = 100_000   // $1,000, in cents
```

```ts
export function mayAutoApplyMutation(kind, consent, trust, opts) {
  if (kind === 'delete') return false        // deletes NEVER auto-apply, no matter what
  if (opts?.highImpact) return false          // large money changes NEVER auto-apply either
  return mayActWithoutConfirm(consent, trust) // otherwise: explicit consent, or graduated trust
}
```

Two hard floors sit *underneath* the trust system, and notice they're
`if`-returns checked **before** trust is even consulted: a `delete` is
never auto-applied, full stop, and a "high-impact" edit (a money field
moving by ≥ $1,000, or two-or-more money fields changing at once —
`patchIsHighImpact`, line 79) always needs a human tap too, even for a user
who has graduated. Trust only ever loosens the *low-stakes* middle ground; it
can't override the two floors.

The score itself is boringly simple and exactly as good as it needs to be:

```ts
export function withSuccessfulConfirm(trust) {
  const next = { ...trust, confirmed_ok: trust.confirmed_ok + 1 }
  const graduated = !next.auto_loose && next.confirmed_ok >= GRADUATE_THRESHOLD && next.confirmed_undone === 0
  if (graduated) next.auto_loose = true
  return { trust: next, graduated }
}

export function withUndo(trust) {
  return { confirmed_ok: trust.confirmed_ok, confirmed_undone: trust.confirmed_undone + 1, auto_loose: false }
}
```

Ten clean confirms with zero undos → auto-apply turns on for future small
edits. **One** undo resets `auto_loose` to `false` immediately — trust is
slow to earn and instant to lose, which is the right shape for a system
managing someone's money. This is a small, honest state machine, not a
machine-learning model — you don't need anything fancier to make an agent
*feel* like it's calibrating itself to how much a specific user trusts it.

## Undo: the safety net behind the safety net

Even a *confirmed* change isn't final. Look at `stageUpdate` (line 2029) and
`stageDelete` (line 2066): before building the patch, both snapshot the row's
current values into `patch.__before`. That snapshot travels all the way
through `ai_pending_actions` and is what powers "Undo" in the UI later — a
soft-deleted transaction can be restored, an edit can be reverted, by reading
`__before` back. Notice the layering: staging (stops bad writes before they
happen) and undo (reverses writes after they happened, and rolls trust back
too, via `withUndo`) are two independent nets, not one relying on the other.

## Recap

- Tier actions by blast radius, not by a single global "AI autonomy" toggle:
  reads and creates run free; updates/deletes are staged by default.
- Make the *execution* of a staged mutation live in a separate code path,
  reachable only from an explicit user action — never let the model's own
  tool call be the thing that writes.
- Guard the execution boundary with its own allowlist, even if it duplicates
  one you already enforced upstream. Don't let one boundary trust another
  just because they're supposed to agree.
- Some actions (hard deletes, large money moves) should have a floor that
  *no* amount of accumulated trust lifts.
- Earning autonomy should be slow (many good outcomes) and losing it should
  be fast (one bad one) — that asymmetry matches how much trust actually
  costs to rebuild in real life.

Next: [05 — Business logic vs. agent logic](05-business-logic-vs-agent-logic.md)
