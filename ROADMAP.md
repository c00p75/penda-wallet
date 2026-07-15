# Penda — Product Roadmap

Penda is an AI-first money companion, not a budgeting app with a chatbot. The
guiding question for everything below: does it make Penda feel more like *an
intelligence that manages your money* and less like *a ledger you operate*?

Last updated: 2026-07-15 (rev 9)

---

## 🔒 Near-term — committed, shipping next

Not someday-maybe. Real exposure or table-stakes gaps we take on before the bold bets below.

- **App lock** — biometric / PIN gate on open (and on reveal of exact balances). Shipping a money app with no lock screen is a live exposure the day we have users on shared or lost phones; this is near-term, not backlog.

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
  - **Action provenance across the app:** Every record knows its origin (manual / voice / SMS / AI-chat) and the UI badges non-manual entries ("auto-added by Penda"). Generalizes the transaction `source` tagging (migration 0017) to all record types — provenance is what makes the audit trail and undo legible.

### 2. Planning & Accountability Rituals · **the retention engine**
Shift from reactive tracking to a proactive behavior-change loop (plan → act → reflect). Penda reaches out, sets intentions with the user, and reviews them on a cadence.
- **Why:** Cadence builds habits, and habits drive retention (DAU/WAU). It gives the AI a relational, structured reason to speak.
- **Scope:** 
  - **Rituals:** A morning "money minute", an evening reconcile, a weekly week-ahead review, and an annual recap. Adaptive cadence (backs off to weekly if the user ignores daily check-ins to avoid nagging).
  - **Spending Plan Object:** A top-level period intention (e.g., "This month I intend to spend K12k") tracked against actuals.
  - **Commitment Pacts:** "No takeout this week"—Penda holds you to it.
  - **Reflection Prompts:** "What felt worth it this week?" (optionally mood-tag spending).
  - **Balance reconciliation — the trust anchor:** The evening reconcile isn't just reflective; it's a truth-check. A lightweight *"Penda has K3,240 — does that match your MoMo? [Yes / Fix]"* keeps computed balance from silently drifting from reality. Everything downstream (Safe Spending Radar, the cashflow timeline, the simulation engine) is only as trustworthy as this match.

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
  - **Full CRUD with tiered confirmation:** Expand the agent's tools beyond create-only to cover the app's domains (transactions, debts, budgets, goals, wallets, categories). Reads and creates flow freely; **updates and deletes always surface a confirmation request before executing** (e.g. *"Delete the K450 groceries entry from Tuesday?"*). Destructive bulk/structural ops (deleting a wallet, mass-deleting transactions) stay forbidden to the agent regardless. This capability matrix is a hard guardrail in the tool layer, distinct from the user-facing consent controls (see Intelligence & Trust).
  - **Atomic multi-tool chains:** A chain must be all-or-nothing. If one step of a `Wallet_Increase` + `Debt_Create` chain fails, the whole chain rolls back (or self-repairs) rather than leaving the ledger half-updated — a silent partial write is exactly the failure this bet promises to prevent.

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

### 11. AI-first budget & goal creation · **onboarding + activation**
Penda proposes budgets based on the last 2-3 months of spending. For goals, the AI uses a **Dream Builder** (asking *"Why?"*) to connect goals to outcomes (e.g., *"This laptop could increase your income"*).

**The set-plan flow — instant plan + AI assist, never a chat gate.** When the user enters an amount and taps *Set plan*, the plan is created **instantly and always succeeds** — no waiting on the model, no forced conversation. The AI then shows up *on* the plan as a proactive assistant: it opens with something specific (it already knows income, recurring spend, persona) and proposes 2-3 tappable budget items rather than interrogating. Every AI-first principle here is a guardrail against friction:
  - **Skippable, always.** A clear "I'll do it myself" path. AI-first ≠ AI-only.
  - **Suggestions over interrogation.** Tappable proposed items (accept / dismiss / edit) beat open-ended Q&A. Every turn is friction; minimize turns.
  - **Ask only what can't be inferred.** Reserve questions for genuine unknowns (goals, upcoming one-offs), never for income/rent we already hold.
  - **Writes go through the tiered-confirmation matrix** (bet #4): item creates flow freely, edits/removes confirm.

**Value-adds that make the budget *real* (not just novel):**

*v1 — build with the set-plan flow:*
  - **Safe-to-spend — the headline number.** After fixed costs and savings, how much is actually free this period (and *per day*). Most users don't want a budget table; they want one number that answers "can I buy this?" This is what the AI surfaces and defends. Supersedes the standalone **Safe Spending Radar** candidate (now folded here).
  - **Fixed vs. flexible auto-detection.** Detect recurring spend (rent, subscriptions, utilities) from transaction history and pre-fill those as fixed lines, so the AI only asks about the *flexible* remainder. Directly shortens the assist flow (fewer questions = less friction).
  - **Actuals mapped to budget lines automatically.** Auto-categorize real transactions against their budget items (reuses the agent's transaction categorization). Without this the budget is a wish, not a tracker.

*Pairs with fresh push infra — build next:*
  - **Burn-rate / pace nudges via push.** *"You're 60% through the month but 85% through groceries."* The AI's recurring, personalized reason to reach out — the natural justification for the notification permission we just shipped. (Overlaps the Rituals cadence in bet #2.)

*Upfront data-model decision (decide now, don't migrate later):*
  - **Rollover: per-period vs. cumulative.** Decide whether a budget line resets each period or carries unspent/overspent forward *before* shipping, so envelope budgeting isn't a painful migration. Builds the **Envelope / rollover** candidate on top of this.

*Fast-follow backlog (named so we don't design into a corner):*
  - **Goals as budget lines.** A savings goal is a budget item that accrues — wire budgeting and goals as the same primitive.
  - **End-of-period retro.** AI recaps how the period went and seeds the next plan, giving the AI memory across cycles (ties into bet #2 rituals and #10 memory).
  - **Cash-flow timing.** Not just "how much" but "will the money be there *when* rent hits?" (this is bet #5, the Living Cashflow Timeline — the budget should hand off to it).
  - **Variable/irregular income handling.** Budget off a conservative baseline or rolling average for lumpy income (ties into the **Buffer Engine** candidate).
  - **Persona-based starter budgets.** Offer a sensible starting budget per persona so cold-start users with no history aren't staring at zero.

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
- **Safe Spending Radar** — Actionable daily guidance: *"You can comfortably spend K410 today."* *(Promoted into bet #11 as "safe-to-spend" — the headline number of the new budget flow.)*
- **Split expenses & settle-up** — Splitwise-style per-member balances.
- **Envelope / rollover budgeting** — build the envelope UX around existing rollover flags. *(Depends on the per-period-vs-cumulative data decision now called out in bet #11.)*
- **Multi-currency & FX** — per-wallet currency conversion.

### Intelligence & Trust
- **AI Autonomy & Consent Controls** — a plain-language surface for what Penda may do unprompted (auto-log SMS, act without confirming, parsing on/off) and what it must always ask about. The control layer that makes bets #1 and #4 safe to ship. Paired with an editable view of AI memory (#10) rather than a settings tree.
- **AI Action Audit Trail & One-Tap Undo** — every AI-initiated create/update/delete lands in a reviewable "Penda did this" trail, each entry reversible in one tap. Guards the *after* where confirmation only guards the *before*. Infra is half-built already (soft-delete via `deleted_at`, the `user_confirmed` flag). Reversibility is what lets confirmations safely loosen over time — a future *graduated-trust* calibration (the AI earns looser confirmations as it proves accurate) depends on this shipping first.
- **"Teach Penda" correction loop** — when Penda miscategorizes, correcting it makes the fix *stick*. The edge function already applies categorization rules server-side, but there's no user-facing way to teach it; close the loop so a correction becomes a durable rule. Turns every AI mistake into learning (ties into AI memory, #10).
- **Context-Aware "Local Market" Intelligence** — plug into physical reality (*"Fuel goes up tonight—filling up today saves K120"*).
- **Ghost Expenses & "Phantom Leak" Detection** — catch compounding behavioral leaks (e.g., peer-to-peer sending fees).
- **Dynamic Financial Missions** — AI-generated missions (*"Five no-spend days starting now"*).
- **Blind Budgeting / "Out of Sight" Mode** — hide exact low balances behind ambient health indicators (green/amber auras) to reduce anxiety.
- **Financial Confidence Score** — replace the generic credit score with a holistic metric based on cash flow, savings runway, and stability.
- **Every gate is a live preview** — let users feel the magic once before hitting the paywall.

### Security & Data Control
*Table stakes for a money app, and a trust play — hardens who can open the app, complementing the AI-action guardrails that harden what the AI can do. (App lock has been promoted to Near-term above.)*
- **Data export** — let users download their full financial history (CSV/JSON). Ownership builds trust; also an app-store/privacy expectation.
- **Account & data deletion** — a real self-serve delete path. Compliance requirement the moment we publish.
