# Penda — Product Roadmap

Penda is an AI-first money companion, not a budgeting app with a chatbot. The
guiding question for everything below: does it make Penda feel more like *an
intelligence that manages your money* and less like *a ledger you operate*?

Last updated: 2026-07-14 (rev 8)

---

## ✅ Recently shipped — the AI-native design pass

A visual + interaction pass that gave the whole app one language and put the AI
on the surface. Reference: the design direction artifact.

- Iris (periwinkle-indigo) promoted to the primary color across every page
- Floating glass bottom nav
- `AiInsight` component — the "AI speaks first" headline unit, wired into all
  five pages with real, computed insights (Home, Budgets, Goals, Challenges, Analytics)
- Budget & goal **progress rings** with coaching (never shaming) copy
- Analytics reordered **insight-first** — the sentence leads, the chart supports
- AI personality **persona deck** (faces, tints, in-voice previews)
- Paywall reframed as an **invitation** instead of a dead-end
- Transaction **timeline** and game-like challenge **leaderboard**

---

## 🎯 The bold bets — what makes Penda category-defining

These are product/architecture moves, not styling. They need dedicated,
coordinated passes (each is more than a UI change).

### 1. Zero-friction data — Ambient SMS & Clipboard Parsing · **the enabler**
The AI cannot manage money it cannot see. In a MoMo-heavy market, manual entry is where finance apps die. Penda needs to read transactions exactly where they happen—in the SMS text—so the data flows automatically.
- **Why:** Removes the highest friction point and guarantees data liquidity.
- **Scope:** Android native wrapper (TWA/Capacitor) for `READ_SMS` parsing of Airtel Money, MTN MoMo, and banks. iOS/Web fallback via a persistent "📋 Paste Copied MoMo Text" chip. Ambient real-time processing toasts and a transparent Activity Log.

### 2. Planning & Accountability Rituals · **the retention engine**
Shift from reactive tracking to a proactive behavior-change loop (plan → act → reflect). Penda reaches out, sets intentions with the user, and reviews them on a cadence.
- **Why:** Cadence builds habits, and habits drive retention (DAU/WAU). It gives the AI a relational, structured reason to speak.
- **Scope:** 
  - **Rituals:** A morning "money minute", an evening reconcile, a weekly week-ahead review, and an annual recap. Adaptive cadence (backs off to weekly if the user ignores daily check-ins to avoid nagging).
  - **Spending Plan Object:** A top-level period intention (e.g., "This month I intend to spend K12k") tracked against actuals.
  - **Commitment Pacts:** "No takeout this week"—Penda holds you to it.
  - **Reflection Prompts:** "What felt worth it this week?" (optionally mood-tag spending).

### 3. Profile Modes: Context, not Code Forks · **the architecture shift**
Treat Individual, Family, and Business accounts as a context layer over the same core engine, not three separate apps.
- **Why:** Trying to build three apps dilutes focus. Changing the "mode" simply changes default categories, terminology, which surfaces show, and how the AI frames things.
- **Scope:** 
  - A mode selector at onboarding (switchable later; users can hold multiple). 
  - Sets defaults and AI context (e.g., Business mode talks margins and runway; Family mode talks shared priorities).
  - Sequence: Individual → Family → Business (Side-hustle lite).

### 4. Agentic Reliability & Multi-Step Reasoning · **the AI upgrade**
The AI must act like an infallible assistant. It cannot silently fail, and it must understand double-entry bookkeeping inherently.
- **Why:** If the AI logs borrowed money as income but forgets the debt, trust evaporates. If it drops a transaction because it's confused, the ledger breaks.
- **Scope:** 
  - **Multi-tool chains:** E.g., intent `borrowed_money` triggers both `Wallet_Increase` AND `Debt_Create`.
  - **The Clarification Fallback:** If the AI is unsure how to categorize a transaction or goal, it halts and asks the user directly in the ambient chat rather than doing nothing.

### 5. The Living Cashflow Timeline · **the paradigm shift**
Replace the traditional static month-to-month budget with a forward-looking timeline based on known income, recurring bills, and average spending.
- **Why:** Traditional budgeting looks at a calendar month; real life looks at the time between paychecks.
- **Scope:** A vertical timeline UI where users scroll into the future. AI highlights upcoming crunch periods: *"Next Tuesday is expensive,"* or *"You have K900 free before payday."*

### 6. The Personal Simulation Engine · **the differentiator**
Penda builds a living simulation of the user by learning their salary patterns, impulse triggers, savings behaviors, and upcoming life events. Let people ask the future out loud.
- **Why:** Highly demo-able; turns anxiety into confident, visual answers.
- **Scope:** In-store AI Shopping Companion (*"Can I buy this TV?"* → *"Future you might regret this... "*), and scenario sliders to model cutting expenses or adjusting debt payoff.

### 7. Penda speaks unprompted — Proactive Coaching · **the moat**
A proactive assistant that surfaces one thing a day without being asked, focusing on **Opportunity Detection** and **Observability**. 
- **Why:** Finance apps are negative. Catching a user doing something good, or proactively solving a problem, builds addiction to the coaching.
- **Scope:** 
  - **Observability:** AI notices patterns (e.g., *"You've spent K150 on unbudgeted coffee this week; should we create a budget for it?"*).
  - **Opportunity:** *"You spent K3,400 less than usual; fund your emergency goal today!"*

### 8. Kill the modal chat — ambient conversation layer · **architecture**
There should be no separate "chat screen." The conversation is the ambient layer under every page — pull the ask bar up from anywhere.

### 9. Voice as the hero, ungated · **growth**
Make voice the free hook; monetize depth (insights history, unlimited members) instead. The most demo-able interaction should not be gated.

### 10. AI memory & The Financial Journal · **makes everything land**
Penda remembers what you told it, your goals, and preferences. Users can log emotional states (*"I stress-buy after work"*), allowing the AI to spot behavioral patterns.
- **Includes:** A Memory Timeline (*"One year ago you wanted to stop living paycheck-to-paycheck. Today you have K14,000 saved."*)

### 11. AI-assisted budget & goal creation · **onboarding + activation**
Penda proposes budgets based on the last 2-3 months of spending. For goals, the AI uses a **Dream Builder** (asking *"Why?"*) to connect goals to outcomes (e.g., *"This laptop could increase your income"*).

---

## 🧭 Candidate features — proposed, unprioritized

A backlog to pull from. Grouped by theme; not yet sequenced or committed.

### The Business Mode ("Side-Hustle Lite") Wedge
*Consciously scoped to resist becoming full accounting software.*
- **Simple Period Profit View:** Revenue minus expenses.
- **Cash Runway:** How long current cash lasts based on average burn.
- **Accounts Receivable:** Built naturally on top of "owed to me" debts.
- **Payment Requests / Simple Invoices:** Mobile-money-native invoicing (potentially a killer feature).
- **Tax Set-Aside:** Auto-reserve a percentage of income into a tax sub-wallet.

### The Family Mode Wedge
- **Household Plan:** A single spending plan mapped across shared wallets.
- **Allowances / Kids' Sub-Wallets:** Pocket money management.
- **Family Intelligence:** AI understands shared grocery budgets, school fees, and rent responsibilities.

### Money in & Automations
- **Bank sync API** — longer-term integration beyond MoMo SMS.
- **The "Buffer" Engine** — actively manage irregular income (e.g., *"Move K1,500 of this large cash-in to a buffer for next month"*).
- **Round-ups & Pay-yourself-first rules** — automatic saving mechanisms.
- **Impulse / cooling-off pause** — *"Want to sit on this K1,500 for 24h?"*

### Money management depth
- **Safe Spending Radar** — Actionable daily guidance: *"You can comfortably spend K410 today."*
- **Split expenses & settle-up** — Splitwise-style per-member balances.
- **Envelope / rollover budgeting** — build the envelope UX around existing rollover flags.
- **Multi-currency & FX** — per-wallet currency conversion.

### Intelligence & Trust
- **Context-Aware "Local Market" Intelligence** — plug into physical reality (*"Fuel goes up tonight—filling up today saves K120"*).
- **Ghost Expenses & "Phantom Leak" Detection** — catch compounding behavioral leaks (e.g., peer-to-peer sending fees).
- **Dynamic Financial Missions** — AI-generated missions (*"Five no-spend days starting now"*).
- **Blind Budgeting / "Out of Sight" Mode** — hide exact low balances behind ambient health indicators (green/amber auras) to reduce anxiety.
- **Financial Confidence Score** — replace the generic credit score with a holistic metric based on cash flow, savings runway, and stability.
- **Every gate is a live preview** — let users feel the magic once before hitting the paywall.
