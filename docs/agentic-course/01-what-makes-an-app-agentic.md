# 01 — What Makes an App "Agentic"

## The one-sentence version

An app is **agentic** when an LLM doesn't just *answer questions about* your
data — it **takes actions that change your data**, in a loop, deciding for
itself which actions to take and when to stop.

That's the line between two very different kinds of "AI app":

| | AI-as-feature (not agentic) | AI-as-actor (agentic) |
|---|---|---|
| What the model does | Reads context, writes a text reply | Reads context, **decides what to do**, does it, checks the result, decides what to do next |
| Example ask | "Summarize my spending this month" | "I spent 12 on coffee" → a transaction row now exists |
| Who changes the data | The user, through a form | The model, through a **tool call** |
| How many steps | One request, one response | A loop: the model can act, observe, act again, until it's done |
| What can go wrong | A bad summary | A bad summary **and** a wrong (or destructive) database write |

Penda is squarely the second column. Look at what one chat message can do in
[`supabase/functions/chat-message/index.ts`](../../supabase/functions/chat-message/index.ts):
the user types "I lent Tich 200 for rent," and the model has to *decide* this
is a two-sided event (cash left the wallet **and** a debt now exists), call a
tool that atomically records both, and only then reply "Got it, logged 200 to
Tich." Nobody wrote a form for "lending money that implies a wallet
transaction." The model figured out the intent and picked the tool.

## Why this is a genuinely different engineering problem

If you've built CRUD apps before, you already know how to validate a form, call
an API, and show a success toast. Agentic apps need all of that, plus answers
to questions a form-based app never has to ask:

1. **The "user input" is now a decision-maker, not just data.** A form submit
   button always does the same thing. A model deciding "is this a debt or a
   transaction?" can decide wrong. Your system has to tolerate that (see
   [04](04-permissions-trust-and-safety.md)).
2. **Actions can chain.** One message might need three tool calls in a row
   (look something up, then update it, then confirm). You need a *loop*, not
   a single request/response (see [02](02-anatomy-of-the-agent-loop.md)).
3. **The model is an unreliable external dependency**, like a flaky third-party
   API, except it also occasionally returns malformed JSON, times out, or gets
   rate-limited by the provider. You need fallbacks and budgets (see
   [06](06-resilience-and-reliability.md)).
4. **Some actions are dangerous.** Reading your spending history is safe.
   Deleting a transaction is not. The permission model has to be stricter than
   "the user is logged in" (see [04](04-permissions-trust-and-safety.md)).
5. **The agent can act without being asked.** Penda doesn't only respond in
   chat — cron-triggered functions like `morning-money-minute` and
   `burn-rate-nudge` decide, on a schedule, whether *today* is a day to
   proactively message you (see [07](07-proactive-agents.md)).

## The autonomy spectrum

It helps to think of "how agentic" as a dial, not a switch:

```
No autonomy                                                   Full autonomy
    |------------------|------------------|------------------|
  Q&A only         Reads + creates    + staged edits      Auto-applied
  (chatbot)         run freely         need confirmation   edits for
                                       (Yes/No card)        trusted users
```

Penda deliberately sits at different points on this dial **depending on the
action's blast radius**, not on some single global "autonomy level." Creating
a transaction is low-risk and reversible (you can see it and delete it), so it
runs immediately. Deleting a transaction is high-risk, so it *always* stops
and asks — no matter how much the app trusts you. You'll see exactly how this
is implemented in [04](04-permissions-trust-and-safety.md); the important idea
for now is: **agentic doesn't mean "let the model do whatever it wants."** It
means *deliberately choosing*, action by action, how much rope the model gets.

## Where "agentic" shows up across Penda

This series is really a tour of five surfaces, each a different flavor of
agent:

- **Conversational agent** — `chat-message`: multi-turn, tool-calling, the
  core of the course (modules 02–04, 09).
- **Perception agents** — `receipt-vision`, `transcribe-voice`: the model's
  "action" is turning an unstructured input (a photo, an audio clip) into
  structured data (module 08).
- **Proactive agents** — `morning-money-minute`, `bill-reminders`,
  `burn-rate-nudge`, `companion-rituals`: no user message at all; a cron job
  decides on its own whether to speak (module 07).
- **Analytical agents** — `generate-insights`: reasons over a user's data in
  bulk to surface patterns nobody asked about directly.
- **Deterministic "fake AI"** — `momoParser.ts`: some things (parsing a
  well-formatted mobile-money SMS) don't need a model at all. Knowing when
  *not* to reach for an LLM is part of building these systems well (module
  05).

## A gut-check before you move on

If someone asked you "why isn't Penda's chat just a wrapper around an LLM API
that answers questions," you should now be able to say: *because it also has
to decide what to do, do it safely, and keep doing that even when the model
or the network misbehaves* — and point at real code for each part. The rest
of this series builds that code up piece by piece.

Next: [02 — Anatomy of the agent loop](02-anatomy-of-the-agent-loop.md)
