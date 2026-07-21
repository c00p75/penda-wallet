# 09 — Frontend Integration

Everything so far has been server-side. This module is the other half: how
[`apps/web/src/features/chat/ChatSheet.tsx`](../../apps/web/src/features/chat/ChatSheet.tsx)
turns a streaming, tool-calling, sometimes-needs-confirmation backend into a
UI that feels alive — typing indicators, live "doing X…" progress, Yes/No
cards — without ever letting the client pretend it has more authority than
it actually does.

## Two different kinds of state, kept apart on purpose

[`chatStore.ts`](../../apps/web/src/features/chat/chatStore.ts) is a tiny
Zustand store holding only *UI chrome*: is the sheet open, what mode
(quick/full), should it autofocus and send a prefilled message, should it
start listening for voice. It holds **no conversation data** — no messages,
no pending actions. That all lives as local component state inside
`ChatSheet.tsx` itself (`messages`, `conversationId`, `actionStatus`, and so
on). Keep these separate: "is a panel open" is global, cheap UI state that
lots of components might want to read or trigger (`openChat()` is called
from all over the app to launch chat with a prefilled message); the actual
back-and-forth of one conversation is local to the one component that's
rendering it. Mixing the two tends to produce a global store that either
leaks conversation internals everywhere or has to be reset defensively every
time a sheet closes.

## Rendering the loop from module 02, live

Recall the streaming hooks from [02](02-anatomy-of-the-agent-loop.md):
`onToken` appends text as it arrives; `onReset` clears it if the model
pivots into a tool call mid-sentence. The client's job is just to wire those
callbacks to `setState` calls that update a streaming bubble — the hard part
(deciding *when* to reset) was already solved server-side.

**Tool progress** is a separate live channel, not part of the SSE stream.
Recall from `chat-message` that each tool call broadcasts `running` → `done`/`error`
over a Supabase Realtime channel named `chat:${conversationId}`. The client
subscribes to the same channel name and renders each event as a step in a
live "doing X… done" trail:

```ts
const channel = supabase.channel(`chat:${conversationId}`)
channel.on('broadcast', { event: 'tool' }, ({ payload }) => {
  // update a liveActions list keyed by payload.id, tracking status: running/done/error
}).subscribe()
```

The comment above this subscription is a good lesson on its own:

```ts
// Keep the tool-progress channel subscribed while the sheet is open, not
// just while a send is in flight: joining only on isPending raced the
// server, the WS join often hadn't completed when the first tool
// broadcast fired, so early cues were silently missed.
```

The first version subscribed only when a message was actually in flight —
which seems efficient, but a WebSocket `subscribe()` handshake takes real
time, and the very first tool call could fire and broadcast *before* the
join finished, silently dropping the earliest progress cue. The fix widens
the subscription's lifetime to match the whole sheet being open, trading a
little idle-connection overhead for never missing an event. **When a
real-time subscription and the event it's listening for can both start at
roughly the same moment, assume the subscription is slower and widen its
scope rather than trying to shave the timing tighter.**

## Confirm cards: the client enforces nothing, it only asks

This is the frontend half of [04](04-permissions-trust-and-safety.md), and
the comment right above `resolveAction` says the whole idea in one line:

```ts
// Yes/Cancel on a staged edit or deletion. The change is applied server-side
// only here, the model never had the power to do it itself.
async function resolveAction(action: PendingAction, decision: 'confirm' | 'cancel') {
  ...
  const res = await confirmAction.mutateAsync({ actionId: action.id, decision })
  setActionStatus((prev) => ({ ...prev, [action.id]: res.status }))
  ...
}
```

`confirmAction` calls the `confirm-ai-action` edge function from
[04](04-permissions-trust-and-safety.md) — the *only* code path that ever
executes a staged mutation. The client renders a card, the user taps a
button, a network call fires, and only the server's response tells the
client what actually happened (`res.status`). The client never assumes
success and updates optimistically before that response comes back — for a
destructive action, that would risk showing "Deleted" when the request
hadn't actually landed yet.

`actionStatus` is a local map from pending-action id → resolved status,
checked before rendering a card's buttons (`if (actionStatus[action.id] ||
resolvingId) return`) — once an action is resolved, its card stops being
interactive even if the message list re-renders. Small detail, but it's what
stops a user from double-tapping "Confirm" and firing two requests (on top
of the server-side `claim()` race guard from module 04 — this is
belt-and-suspenders, same as the duplicated allowlists you saw earlier: the
client guard is a UX nicety, the server guard is the actual enforcement).

## Resilience doesn't stop at the edge function

The offline path mirrors this same care:

```ts
if (!navigator.onLine) {
  await enqueueAiConfirm(action.id, decision)   // queue it locally
  setActionStatus((prev) => ({ ...prev, [action.id]: decision === 'confirm' ? 'confirmed' : 'cancelled' }))
  pushMessage({ ...text: "Queued. I'll apply that when you're back online." })
  return
}
```

A confirm/cancel tap while offline doesn't fail or silently do nothing — it's
queued locally and replayed once connectivity returns. This is the same
principle from [06](06-resilience-and-reliability.md) (never let a failure
mode be "the request just vanishes") applied on the client instead of the
server. Notice it needed its own local `actionStatus` update too, so the card
doesn't sit there re-offering buttons for a decision that's already queued.

## The chat response feeds the rest of the app, not just the chat window

```ts
replaceMessage(bubbleId, reply)
invalidateAfterChatResponse(queryClient, walletId, result)
```

When the agent creates a transaction, that shouldn't only be visible inside
the chat bubble — the ledger page, the analytics page, the home screen's
balance should all reflect it immediately too. `invalidateAfterChatResponse`
tells the app's data-fetching cache (React Query) which queries are now
stale because of what this chat turn just did, so every other screen
refetches and catches up. This is the payoff of treating the agent as a
first-class actor in the app's data model rather than a bolted-on side
panel: one conversational turn can update state that the *entire app* reads
from, not just a chat transcript.

## Recap

- Keep ephemeral UI state (is a panel open, what mode) separate from actual
  conversation state (messages, pending actions) — different lifetimes,
  different owners.
- A realtime subscription and the event it's meant to catch can race each
  other; when in doubt, widen the subscription's lifetime rather than trying
  to time it precisely.
- The client should never treat a proposed action as done until the server
  that's actually authorized to execute it says so — no optimistic UI for
  destructive confirms.
- Extend resilience patterns (queue-and-retry) to the client, not just the
  server — "offline" and "the model is unavailable" are the same shape of
  problem.
- When an agent's action changes data other parts of the app already show,
  wire its result into your existing cache-invalidation system rather than
  treating the chat window as an island.

Next: [10 — Testing agentic systems](10-testing-agentic-systems.md)
