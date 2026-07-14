# Penda — Product Roadmap

Penda is an AI-first money companion, not a budgeting app with a chatbot. The
guiding question for everything below: does it make Penda feel more like *an
intelligence that manages your money* and less like *a ledger you operate*?

Last updated: 2026-07-14

---

## ✅ Recently shipped — the AI-native design pass

A visual + interaction pass that gave the whole app one language and put the AI
on the surface. Reference: the design direction artifact.

- Iris (periwinkle-indigo) promoted to the primary color across every page
- Floating glass bottom nav
- `AiInsight` component — the "AI speaks first" headline unit, wired into all
  five pages with real, computed insights (Home, Budgets, Goals, Challenges,
  Analytics)
- Budget & goal **progress rings** with coaching (never shaming) copy
- Analytics reordered **insight-first** — the sentence leads, the chart supports
- AI personality **persona deck** (faces, tints, in-voice previews)
- Paywall reframed as an **invitation** instead of a dead-end
- Transaction **timeline** and game-like challenge **leaderboard**

---

## 🎯 The bold bets — what makes Penda category-defining

These are product/architecture moves, not styling. They need dedicated,
coordinated passes (each is more than a UI change).

### 1. Penda speaks unprompted — proactive AI · **the moat**
The defining shift. A proactive assistant that surfaces one thing a day without
being asked — "This weekend usually costs you ~K850", "Electricity is up",
"You're on pace to hit your laptop goal 11 days early."
- **Why:** every competitor waits to be opened. Reaching out is what makes
  Penda a *companion* rather than a tool.
- **Scope:** a server-side job that generates a daily insight per wallet
  (extend the existing insights pipeline + weekly-digest cron); delivery via
  push notification and a home-screen banner; dismissible; respects personality.
- **Depends on:** insights generation, push subscriptions (both already exist in
  some form), personality tone.

### 2. Kill the modal chat — ambient conversation layer · **architecture**
There should be no separate "chat screen." The conversation is the ambient
layer under every page — pull the ask bar up from anywhere and the current
screen becomes context the AI already sees.
- **Why:** the most valuable thing in the app currently hides behind a bottom
  sheet. You never "go to" the AI because you never left it.
- **Scope:** promote chat to a persistent, app-level surface; pass current
  route/context into each message; keep conversation state across navigation.
- **Depends on:** chat API, a shared conversation store.

### 3. Voice as the hero, ungated · **growth**
"Talking to your money" is the most demo-able, word-of-mouth interaction Penda
has — and it's currently locked behind a paywall with nothing to buy. Make voice
the free hook; monetize depth (insights history, unlimited members) instead.
- **Why:** the hook that defines the product should not be gated.
- **Scope:** remove the voice entitlement gate; keep voice prominent on Home;
  re-slot monetization onto depth features.
- **Depends on:** entitlements config, voice recorder (already built).

### 4. Every gate is a live preview · **monetization**
_Partially done — the paywall now reads as an invitation._ The remaining piece:
let users **feel the magic once** — scan one receipt, hear one weekly insight —
then invite them to keep it.
- **Why:** a paywall that has demonstrated its value converts; a locked door
  trains people to stop pushing on locked doors.
- **Scope:** a one-time free trial per gated feature (receipt scan, weekly
  insight), tracked per user; then the invitation.
- **Depends on:** entitlements, receipts/insights pipelines, per-user trial state.

### 5. The persona colors the whole app · **identity**
_Partially done — the persona deck exists in Settings._ The remaining piece:
make the chosen character **visible everywhere** — tint the AI orb, shape
insight phrasing, subtly warm the accent — so casting a companion is felt on
every screen, not just stored in a column.
- **Why:** turns a settings toggle into the emotional core of the product.
- **Scope:** thread `ai_personality` into the `AiInsight`/orb tone and insight
  copy generation app-wide.
- **Depends on:** the persona metadata (already defined), insight generation.

---

## Notes
- Sequencing suggestion: **3 (ungate voice)** is the cheapest high-impact win;
  **1 (proactive AI)** is the biggest differentiator and worth the most
  investment; **2 (ambient chat)** is the largest architectural lift.
- Items 4 and 5 are finish-what-was-started and can slot in opportunistically.
