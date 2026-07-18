# Penda — Product Roadmap

Penda is an AI-first money companion, not a budgeting app with a chatbot. The
guiding question for everything below: does it make Penda feel more like *an
intelligence that manages your money* and less like *a ledger you operate*?

Last updated: 2026-07-18 (rev 15)

---

## ✅ Recently shipped — chat trail + polish pass (rev 15)

- Chat ActionTrail: multi-step live progress, durable expandable rows, confirms in-trail
- Deep-links for creates (goal/budget/debt/memory) + settle-up / journal / analytics hrefs
- Teach Penda via chat (`teach_categorization`); habits contributions in the trail
- In-chat Undo + hop to AI actions; expanded undo via `__before` snapshots
- Home InsightCarousel + voice quick-log; ledger receipt scan
- Habits empty-state + morning-minute helper; graduated trust banner
- FX “rates as of” freshness; offline queue for AI confirms
- Paywall interest waitlist (Stripe checkout still external)

---

## 🎯 The bold bets — what makes Penda category-defining

### 1. Zero-friction data — Ambient SMS & Clipboard Parsing · **the enabler** — 🟡 partial
- **Shipped:** MoMo/bank paste parser, `source` provenance, UI badging, Activity Log,
  MoMo balance → reconcile prompt.
- **Not shipped:** Android native `READ_SMS` (needs device/signing). Ambient
  real-time SMS toasts on a native wrapper.

### 2. Planning & Accountability Rituals · **the retention engine** — ✅ shipped
- Spending plan, reflection/retro, balance reconciliation, commitment pacts, buffer
  suggestion, impulse pause, missions, morning money-minute, adaptive cadence,
  annual recap.

### 3–11. · **✅ shipped** (see prior revs)
Profile modes, agentic CRUD + atomic borrow/lend, cashflow timeline, simulator,
proactive coaching, ambient chat, ungated voice, AI memory + journal (+ timeline),
AI-first budgets/goals (rollover, fixed costs, goals-as-lines, irregular income,
persona starters).

---

## 🧭 Candidate features — status

### The Business Mode ("Side-Hustle Lite") Wedge — ✅ shipped (lite)
- Period profit, cash runway, AR from owed-to-me debts, tax set-aside % — `/business`
- **Still open:** Mobile-money payment requests / invoices (external rails)

### The Family Mode Wedge — ✅ shipped
- Household plan snapshot, member allocations, assigned allowances, settle-up link,
  invite CTA — `/family`

### Onboarding Enrichment — ✅ shipped
Primary goal, household/team size, notification ask, income range, gender,
starter savings goal seed.

### Money in & Automations — 🟡 partial
- Buffer suggestion, round-up + PYF auto-post, impulse pause — shipped
- **Still open:** Bank sync API (external)

### Money management depth — ✅ shipped
- Envelope remaining, splits, settle-up balances, multi-currency FX conversion + freshness UI

### Intelligence & Trust — ✅ shipped (market feeds open)
- AI consent, audit + undo (updates + deletes with snapshots), graduated trust,
  Teach Penda (form + chat), screen-aware AI, session rotation, ghost leaks, missions,
  blind budgeting, confidence score, paywall interest waitlist
- **Still open:** Local market intelligence (external data); live Stripe purchase

### Chat performance — ✅ shipped (SSE deferred)
- Parallel fetches, tool-progress Realtime cues, ActionTrail, offline chat + confirm queue
- **Still open:** Full SSE token streaming (lifecycle cues cover the gap for now)

### Security & Data Control — ✅ shipped
App lock, data export, account deletion.

---

## Out of reach in this environment

- Android / Capacitor `READ_SMS` ambient ingest
- Live bank sync / MoMo invoicing rails
- Local market price feeds
- Live Stripe Premium checkout (needs account, price IDs, webhook secrets)
