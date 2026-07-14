# Penda — Product Roadmap

Penda is an AI-first money companion, not a budgeting app with a chatbot. The
guiding question for everything below: does it make Penda feel more like *an
intelligence that manages your money* and less like *a ledger you operate*?

Last updated: 2026-07-14 (rev 4)

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

### 6. AI-assisted budget & goal creation · **onboarding + activation**
Setting up a budget or goal is the moment people abandon finance apps — a blank
form asking for numbers they don't know. Penda should propose them.
- **Budgets:** analyze the last 2–3 months of real spending and suggest a
  realistic cap per category ("You've averaged K2,100/mo on dining — set the cap
  at K2,000?"). One tap to accept, adjust, or dismiss.
- **Goals:** turn a plain-language wish into a structured goal — "save for a
  laptop by September" → target amount (asks or estimates), target date, and a
  suggested monthly/weekly contribution to make it, with the pace forecast
  attached. Reachable from the ask bar and the empty states.
- **Why:** removes the hardest step and shows the AI's value immediately;
  budgets/goals become a conversation, not a form.
- **Scope:** spending-history aggregation per category; an AI action that emits
  a structured `BudgetInput`/`SavingsGoalInput` for one-tap confirmation;
  entry points on empty states and in chat.
- **Depends on:** transactions history, categories, chat/AI actions (see bet 2).

### 7. Scenario / simulator — "what if" money modeling · **differentiator**
Let people ask the future out loud and see it move. "What if I cut dining by
K500 a month?", "If I pay K2,000/mo, when is this debt clear?", "Can I afford a
K9,000 trip in December?" — Penda answers with a projected outcome, not a lecture.
- **Why:** deeply AI-native, highly demo-able, and it turns anxiety ("can I
  afford this?") into a confident, visual answer. Few finance apps let you play
  with your own future.
- **Scope:** a lightweight projection engine over income cadence, budgets,
  goal pace, and debt payoff (much of the math already exists in the goal
  forecast and debt logic); expose it through the ask bar and as a dedicated
  "what if" surface with adjustable sliders and a before/after view.
- **Depends on:** goal pace forecast + debt payoff math (partly built),
  transactions history, chat/AI actions (bet 2). Feeds the financial health
  score and proactive AI (bet 1).

### 8. Digital savings groups (chilimba / village banking / ROSCA) · **market wedge**
Rotating community savings are how a large share of the Kwacha market already
saves. Almost no app does them well, and Penda already has most of the pieces:
shared wallets, invite codes, member roles, and challenges.
- **Why:** a defensible, culturally-native wedge rather than a me-too feature;
  turns Penda into infrastructure for how people actually save here.
- **Scope:** a group entity with members, a contribution schedule, a payout
  rotation, and transparent per-member ledgers; reminders when a round is due;
  built on the existing wallet-membership + invite-code machinery.
- **Depends on:** wallets/members, invite codes, recurring schedule, reminders.

### 9. AI memory — a companion that remembers · **makes everything land**
Penda should remember what you told it ("last month you said you wanted to cut
takeout"), your goals, and your preferences, and refer back to them.
- **Why:** the cheapest way to make the whole companion feel real. A stateless
  chatbot is a tool; a companion with memory is the product. It also amplifies
  the personality, proactive-AI, and coaching bets.
- **Scope:** a per-user memory store (facts, stated intentions, preferences)
  written from conversations and read into future AI context; user-visible and
  editable ("what Penda remembers") for trust.
- **Depends on:** chat/AI actions (bet 2), profile.

---

## 🧭 Candidate features — proposed, unprioritized

A backlog to pull from. Grouped by theme; not yet sequenced or committed.

### Money in (the biggest lever)
- **Mobile-money & bank sync** — auto-import from Airtel Money / MTN MoMo /
  M-Pesa and bank feeds. In a Kwacha market this is likely the single highest-
  value feature: it removes manual entry entirely and feeds every AI insight.
- **SMS transaction parsing** — as a lighter first step, parse mobile-money
  confirmation SMS into transactions (on-device or pasted), no integration
  needed.
- **Irregular-income handling** — budgets and safe-to-spend assume a steady
  salary; many users earn variable/informal income. Smooth it: average income,
  a "set-aside" buffer in fat months, gentle guidance in lean ones.

### Money management depth
- **Split expenses & settle-up** — shared wallets and the "Split dinner" chip
  already imply this; add a Splitwise-style per-member balance and settle-up.
- **Bill reminders & due dates** — debts and recurring rules already carry
  dates; surface upcoming bills and nudge before they're due.
- **Envelope / rollover budgeting** — the `rollover` flag exists on budgets;
  build the envelope UX around it.
- **Multi-currency & FX** — (in progress) per-wallet currency + conversion so
  goals and balances read in one base currency.
- **Safe-to-spend** — a single daily number derived from income cadence minus
  commitments (the hero number from the Home direction).
- **Net-worth tracking** — assets minus debts over time; gives the financial
  health score real substance.
- **Airtime & data budgeting** — first-class categories that signal you
  understand the market.

### Automations (behavioral, anxiety-reducing)
- **Round-ups → goals** — round each expense up and sweep the difference into a
  savings goal. High-conversion saving with almost no user effort.
- **Pay-yourself-first rules** — auto-allocate to a goal on payday, before it
  gets spent.
- **Impulse / cooling-off pause** — "want to sit on this K1,500 for 24h?" A calm
  nudge that reduces regret spending.
- **Learning auto-categorization** — Penda learns your merchants so entries
  categorize themselves; quietly improves every downstream AI feature.

### Intelligence
- **Anomaly & subscription watch** — flag unusual charges, auto-detect
  recurring/subscriptions the user didn't mark, and price creep on bills.
- **Receipt itemization** — extend receipt scan beyond the total to line items,
  split across categories automatically.
- **Monthly narrative recap** — an AI-written story of the month, not a chart.
- **Natural-language history queries** — "how much at Shoprite this year?",
  "what did I spend on transport last month?" — a low-lift, high-delight use of
  the AI you already have.
- **Penda Pro coaching** — behavioral coaching + financial *education* grounded
  in the user's own data ("you'd clear this debt 4 months sooner by…"). A Pro
  monetization surface. Explicitly *not* regulated advice (no investment / tax /
  credit product recommendations); ships with a plain disclaimer.

### Engagement & growth
- **Streaks, milestones & badges** — celebrate no-spend streaks and savings
  milestones (the celebration moments from the direction). Home for the
  achievements gallery is the Compete tab; personal milestones still fire
  in-context on Home/Goals.
- **Shared goals** — a household saving toward one goal together.
- **"Penda Wrapped" / Year in Review** — a shareable, personality-narrated
  recap; a proven organic-growth loop, cheap to build on existing data.
- **Referral program** — invite a friend, both unlock something; ties into the
  challenges/social loop.

### Trust & onboarding
- **Financial health score** — a single evolving, transparent, trend-based
  number (encouraging, never a shaming grade).
- **First-run onboarding** — set currency, then create a first budget/goal via
  the AI (ties directly to bet 6).
- **Privacy mode** — one tap to blur/hide balances on a shared device or in
  public.
- **Biometric / PIN lock** — protect the PWA on a shared device.
- **Data export** — CSV / PDF statements and reports.

---

## Notes
- Sequencing suggestion: **3 (ungate voice)** is the cheapest high-impact win;
  **1 (proactive AI)** is the biggest differentiator and worth the most
  investment; **2 (ambient chat)** is the largest architectural lift.
- Items 4 and 5 are finish-what-was-started and can slot in opportunistically.
