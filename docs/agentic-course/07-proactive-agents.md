# 07 — Proactive Agents

Every module so far has been about the agent reacting to a message. But
Penda also messages *you*, unprompted: "Bill due tomorrow," "Month-to-date
net K450, a calm start." Nobody sent a chat message to trigger those. This
module covers the other half of "agentic" — code that decides, on its own
schedule, whether today is a day to speak up.

These live in cron-triggered edge functions: `morning-money-minute`,
`bill-reminders`, `burn-rate-nudge`, `companion-rituals`. Same platform
(Supabase Edge Functions), completely different trigger: not an HTTP request
from your app, but a scheduled job hitting the function on a timer.

## The trigger: a cron secret, not a user session

Every function you've read so far authenticates a *user* (their session
token). A cron job has no user — it's your own infrastructure calling itself.
`bill-reminders` and `morning-money-minute` both start the same way:

```ts
if (req.headers.get('X-Cron-Secret') !== CRON_SECRET) {
  return jsonResponse({ error: 'Forbidden' }, 403)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
```

Two things worth noting: the secret is a dedicated value (`CRON_SECRET`,
stored in Supabase Vault) rather than reusing something already lying around
— a purpose-built credential instead of overloading an existing one. And the
client is created with the **service-role key**, not an anon key plus a
user's `Authorization` header, because there's no user in this request to
scope Row Level Security to — the function has to see across *all* users to
decide who gets a notification today. That's a lot of power concentrated in
one function, which is exactly why the secret check comes first, before a
single database query runs.

## The shape every proactive function shares

Read `bill-reminders` end to end
([`supabase/functions/bill-reminders/index.ts`](../../supabase/functions/bill-reminders/index.ts))
— it's short, and the shape repeats in every cron function:

1. Query for *candidates* ("bills due today or tomorrow," "opted-in profiles").
2. Fan out over each candidate, deciding independently whether to act.
3. Never let one candidate's failure sink the whole batch.
4. Never notify the same person about the same thing twice.

### Fan-out with a concurrency cap, not a plain loop

```ts
const results = await mapLimit(bills ?? [], 8, async (bill) => {
  try {
    return await remindForBill(supabase, bill as RecurringRow, today)
  } catch (err) {
    console.error(`Bill reminder failed for ${bill.id}:`, err instanceof Error ? err.message : String(err))
    return { billId: bill.id, error: 'failed' }
  }
})
```

`mapLimit` ([`_shared/concurrency.ts`](../../supabase/functions/_shared/concurrency.ts))
processes at most 8 items concurrently instead of either (a) one at a time,
which the doc comment calls out by name — *"sequential processing puts total
runtime on a collision course with the function execution limit as wallets
grow"* — or (b) all at once, which would hammer the database and any push
provider with an unbounded burst. And notice the `try`/`catch` is *inside*
each `mapLimit` call, per item, not wrapped around the whole batch: one
user's bad data (a malformed template, a missing wallet) logs an error and
returns `{ error: 'failed' }` for *that one row*, while the other 199 users
in the batch still get processed. A cron job that dies on user #47 and never
reaches user #48 is a much worse failure than one slow row silently skipped
and logged.

### Never notify twice: dedupe keys

`notifyUser` ([`_shared/notify.ts`](../../supabase/functions/_shared/notify.ts))
takes a `dedupeKey`, e.g. `` `bill:${bill.id}:${bill.next_run_date}` ``. The
`notifications` table has a unique constraint on `(user_id, dedupe_key)`; a
second insert attempt for the same key hits Postgres error `23505` (unique
violation), which `notifyUser` catches deliberately:

```ts
if (input.dedupeKey && error.code === '23505') {
  // already delivered; do not push again
  return { inserted: false, notificationId: existing?.id ?? null, pushed: false, skippedReason: 'dedupe' }
}
```

This matters because cron jobs can, and eventually will, run twice for the
same window — a retry after a timeout, an overlapping schedule, a manual
re-trigger while debugging. **Idempotency shouldn't be "we're careful not to
run it twice"; it should be structural** — let the database's own unique
constraint be the source of truth for "have we already done this," and treat
the resulting error as an expected, handled outcome rather than a crash.

## Deciding *whether* to speak, not just *what* to say

The most "agentic" part of these functions isn't the message text — it's the
judgment calls about whether today is the right day to send anything at all.
Three independent gates stack up in `morning-money-minute`:

**1. Did the user ask for this category of notification?**
```ts
const prefs = normalizeNotificationPrefs(profile.notification_prefs)
if (!prefs.morning_minute || !prefs.tips) return { userId: profile.id, skipped: 'prefs' }
```

**2. Is this user tired of being nudged?** `shouldSkipSoftNudge`
([`_shared/engagement.ts`](../../supabase/functions/_shared/engagement.ts)):

```ts
export function shouldSkipSoftNudge(stats: EngagementStats): boolean {
  const opens = stats.nudge_opens
  const dismisses = stats.nudge_dismisses
  if (opens + dismisses < 4) return false        // not enough signal yet, give it a chance
  const denom = Math.max(opens, 1)
  return dismisses / denom > 0.5                  // dismissing more than half the time → stop
}
```

This is adaptive cadence: a user who dismisses more nudges than they open
stops getting soft ("tip"-tier) nudges, without anyone configuring a
threshold by hand. It's a tiny ratio, not a machine-learning model, but it
gives the same felt effect — the app backs off when it's clearly annoying
someone. This is a good pattern to reuse anywhere you have a "should I
proactively interrupt this user" decision: track opens vs. dismisses, and
gate on the ratio once you have enough samples to trust it.

**3. Is it quiet hours, or has the user seemed low/stressed lately?**
`notifyUser` itself gates "soft" kinds (`tip`, `insight` — never `alert`
kinds like a bill due tomorrow) behind `shouldQuietNudge`, which looks at the
hour, day of week, and the user's most recent mood memories (the same
`ai_memories` table `save_memory` writes to in
[03](03-tool-calling-mechanics.md) — proactive and conversational agents
share the same memory of the user). A stressed user doesn't get an
upbeat spending tip at 11pm on a Sunday just because the cron job fired.

Notice the layering: preference opt-in, then behavioral adaptation, then
situational awareness, each a separate, independently testable gate — not
one giant `if` statement mixing all three concerns.

## Push delivery cleans up after itself

```ts
for (const sub of subscriptions ?? []) {
  const result = await sendPush(...)
  if (result.ok) pushed = true
  else if (result.statusCode === 404 || result.statusCode === 410) {
    await supabase.from('push_subscriptions').delete().eq('id', sub.id)
  }
}
```

A push endpoint that returns 404/410 means the browser/OS has permanently
invalidated that subscription (uninstalled, permissions revoked, etc.) —
retrying it forever would be pointless. The delivery path prunes it on the
spot. Small detail, but it's the difference between a notifications system
that stays healthy and one that slowly fills up with dead subscriptions it
keeps failing to reach.

## Recap

- A proactive agent has no user session to authenticate — gate it behind its
  own dedicated secret and use elevated (service-role) access deliberately,
  not by accident.
- Fan out over candidates with a concurrency cap, and catch failures **per
  item**, not around the whole batch — one bad row should never sink the run.
- Make "don't notify twice" a database constraint you handle, not a
  discipline you hope to maintain in application code.
- Split "should I act at all" into independent, stacked gates — explicit
  opt-in, behavioral adaptation (dismiss ratio), and situational awareness
  (quiet hours, mood) — rather than one tangled condition.
- Clean up dead delivery endpoints when the provider tells you they're dead.

Next: [08 — Multimodal tools](08-multimodal-tools.md)
