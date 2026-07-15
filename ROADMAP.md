# Penda — Product Roadmap

Penda is an AI-first money companion, not a budgeting app with a chatbot. The
guiding question for everything below: does it make Penda feel more like *an
intelligence that manages your money* and less like *a ledger you operate*?

Last updated: 2026-07-15 (rev 10)

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
- **App lock** — biometric / PIN gate on open and on reveal of exact balances

---

## 🎯 The bold bets — what makes Penda category-defining

These are product/architecture moves, not styling. Each needed a dedicated,
coordinated pass. Status noted per bet — several turned out to already be
substantially built from earlier passes; this rev corrects that record against
what's actually in the codebase rather than commit-log guesswork.

### 1. Zero-friction data — Ambient SMS & Clipboard Parsing · **the enabler** — 🟡 partial
The AI cannot manage money it cannot see. In a MoMo-heavy market, manual entry is where finance apps die.
- **Shipped:** Deterministic MoMo/bank SMS-text parser (Airtel, MTN, Zamtel, banks; ZMW/USD) with a persistent "📋 Paste Copied MoMo Text" chip as the iOS/web fallback. Transactions carry a `source` (`manual`/`chat`/`voice`/`receipt`/`recurring`/`sms`) so provenance is tracked end-to-end.
- **Not shipped:** The Android native wrapper (TWA/Capacitor) for actual `READ_SMS` — needs a native build + a physical device to sign and test, out of reach in this environment. Ambient real-time processing toasts and a transparent Activity Log. Provenance badging in the UI ("auto-added by Penda") beyond the raw `source` column.

### 2. Planning & Accountability Rituals · **the retention engine** — 🟡 partial
Shift from reactive tracking to a proactive behavior-change loop (plan → act → reflect).
- **Shipped:**
  - **Spending Plan Object** — a monthly intention tracked against actuals, instant-save, never a chat gate.
  - **Reflection Prompts** — free-text "what felt worth it" near month-end, plus a computed **end-of-period retro** that seeds the next plan off last month's actual spend.
  - **Balance reconciliation — the trust anchor.** A once-a-day ledger prompt: *"Penda has K3,240 — does that match your MoMo? [Yes / Fix]."* Fix posts a balancing transaction for the difference. This is the evening-reconcile ritual's core mechanic.
  - **Commitment Pacts** — "No takeout this week": pick a category to avoid over a window; status (active/kept/broken) computed live from transactions, never stored/stale.
- **Not shipped:** The morning "money minute," a *pushed* weekly week-ahead review, and an annual recap — plus the adaptive cadence (backing off to weekly if daily check-ins get ignored). Deliberately not rushed: adaptive backoff needs real engagement data to tune sensibly, and stacking more daily/weekly pushes on top of the existing burn-rate nudge risks notification fatigue without a coordinated cadence budget across all of them.

### 3. Profile Modes: Context, not Code Forks · **the architecture shift** — ✅ shipped
Individual, Family, and Business as a context layer over the same engine.
- Mode selector in Settings, per-mode terminology (`termFor`) used across the ledger, and — this pass — the chat agent's system prompt now actually injects the mode's `aiContext` fragment, so a Family or Business wallet gets framed accordingly instead of only affecting client-side copy.

### 4. Agentic Reliability & Multi-Step Reasoning · **the AI upgrade** — ✅ shipped
- **Full CRUD with tiered confirmation** — creates/reads run immediately; updates/deletes always stage a Yes/Cancel confirmation card via `ai_pending_actions`, applied only by `confirm-ai-action`. Structural edits (wallet currency, system categories, wallet deletion) are guarded off in the tool layer.
- **Multi-tool chains + the Clarification Fallback** — the system prompt already directed the model to fire both `create_transaction` and `create_debt` for a borrow/lend event, and to ask one clarifying question when genuinely unsure rather than guess or stay silent.
- **Atomic multi-tool chains — this pass.** The borrow/lend chain was two independent inserts with no linkage: a failure after the first succeeded left a transaction with no matching debt. Replaced with `log_borrow_or_lend`, a single Postgres function doing both inserts in one call — either raising rolls back the whole thing — and a new `log_borrowed_or_lent_money` tool wired to it.

### 5. The Living Cashflow Timeline · **the paradigm shift** — ✅ shipped
A vertical timeline (`/cashflow`) projecting forward from current balance, active recurring bills, and average discretionary spend — surfacing exactly the promised copy: *"You have K900 free before payday"* / *heading short before Tuesday*.

### 6. The Personal Simulation Engine · **the differentiator** — ✅ shipped
The "Can I buy this?" shopping companion (*"Future you might regret this…"*) and a spend-cut slider were already live. **This pass** added the other named scenario: a debt-payoff slider (`projectDebtPayoff` — standard amortization) showing months-to-debt-free and total interest at a chosen extra monthly payment, folded into the same 30-day affordability check.

### 7. Penda speaks unprompted — Proactive Coaching · **the moat** — ✅ shipped
- **This pass:** the daily burn-rate cron now falls through to a coaching check when no budget is burning — an underspend opportunity, an unbudgeted spending pattern, or a goal worth celebrating — so "one thing a day, unprompted" isn't limited to budget pace. Still capped at one push per member per day. A cold-start wallet with zero budgets is no longer skipped outright, since it can still have goals or patterns worth a nudge.

### 8. Kill the modal chat — ambient conversation layer · **architecture** — ✅ shipped
No `/chat` route exists. `AmbientChat` mounts one `ChatSheet` app-wide with a pull-up "Ask Penda" handle reachable from every page (the ledger has its own richer ask bar instead of the handle, to avoid a double affordance).

### 9. Voice as the hero, ungated · **growth** — ✅ shipped
Hold-to-talk / tap-to-lock voice input, server transcription via Groq Whisper — confirmed zero premium/paywall gating anywhere in the chat or voice code path.

### 10. AI memory & The Financial Journal · **makes everything land** — ✅ shipped
`ai_memories` + the Journal page already let a user log notes/moods/preferences/facts by hand. **This pass:** the chat agent now reads the user's most recent memories into its system prompt (so it can reference a stated preference or mood pattern without being re-told), and a new `save_memory` tool lets the AI capture something worth remembering mid-conversation instead of memory only ever being written from the Journal page.
- **Not shipped:** the Memory Timeline retrospective view (*"One year ago you wanted to stop living paycheck-to-paycheck…"*).

### 11. AI-first budget & goal creation · **onboarding + activation** — ✅ shipped
The instant set-plan flow, safe-to-spend headline number, and Dream Builder were already live. **This pass shipped the full remaining list:**
- **Rollover: per-period vs. cumulative** — decided and built. `get_budget_progress` now walks history since a budget's start date and carries unspent/overspent forward cumulatively when rollover is on (previously a stored flag with no effect).
- **Fixed vs. flexible auto-detection** — `detectRecurringSpend` finds stable-amount, weekly/monthly-cadence merchants straight from transaction history (not just registered recurring rules), and the set-plan assist tells the AI about them so it doesn't ask.
- **Actuals mapped to budget lines automatically** — verified already shipped (`get_budget_progress` RPC).
- **Goals as budget lines** — a goal's required monthly contribution (to stay on pace for its target date) now reserves against the plan the same way an upcoming bill does.
- **End-of-period retro** — see bet #2.
- **Variable/irregular income handling** — detects lumpy income (coefficient of variation across recent months) and seeds the next plan off the leanest recent month instead of the average when income is irregular enough to make the average unsafe.
- **Persona-based starter budgets** — a cold-start wallet with a plan set but no spending history gets a starter split weighted by the user's chosen AI persona, instead of staring at zero.

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
- **The "Buffer" Engine** — actively manage irregular income (e.g., *"Move K1,500 of this large cash-in to a buffer for next month"*). Builds on the variable-income detection shipped in bet #11.
- **Round-ups & Pay-yourself-first rules** — automatic saving mechanisms.
- **Impulse / cooling-off pause** — *"Want to sit on this K1,500 for 24h?"*

### Money management depth
- **Split expenses & settle-up** — Splitwise-style per-member balances.
- **Envelope / rollover budgeting** — the per-period-vs-cumulative decision this depended on shipped in bet #11; the dedicated envelope UX on top of it is still open.
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
*Table stakes for a money app, and a trust play — hardens who can open the app, complementing the AI-action guardrails that harden what the AI can do. (App lock shipped — see above.)*
- **Data export** — ✅ shipped. Download the wallet's full financial history as structured JSON or a flat transactions CSV, client-side against the user's own RLS-scoped data.
- **Account & data deletion** — 🟡 in progress (a self-serve delete path is being built; not yet verified complete as of this writing). Compliance requirement the moment we publish.
