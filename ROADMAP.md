# Penda — Product Roadmap

Penda is an AI-first money companion, not a budgeting app with a chatbot. The
guiding question for everything below: does it make Penda feel more like *an
intelligence that manages your money* and less like *a ledger you operate*?

Last updated: 2026-07-18 (rev 13)

---

## ✅ Recently shipped — integrity + roadmap surfaces pass

Bugfix + candidate backlog implementation (rev 13):

- Chat: wallet-scoped remount, newest-40 history window, parallel context fetches,
  6h session rotation, tool-progress broadcast, offline chat queue, confirm → View
  deep link, screen-aware `pageContext`, AiInsight tap-to-ask, page chips
- Money math: local calendar dates, burn-rate uses effective/rollover caps,
  locale-safe balance split, unified safe-to-spend (plan math when present)
- Trust: lock disable requires unlock, Teach Penda rules, AI consent controls,
  AI action audit + undo, activity log, provenance badges, MoMo → reconcile
- Modes: Business hub (profit / runway / AR / tax %), Family hub (household plan +
  allowances), Missions, confidence score, ghost-leak detection, impulse pause,
  buffer suggestion, split expenses, envelope remaining, blind budgeting,
  round-up / pay-yourself-first settings, paywall one-shot receipt preview
- Onboarding seeds a starter savings goal from primary goal

---

## 🎯 The bold bets — what makes Penda category-defining

### 1. Zero-friction data — Ambient SMS & Clipboard Parsing · **the enabler** — 🟡 partial
- **Shipped:** MoMo/bank paste parser, `source` provenance, UI badging, Activity Log,
  MoMo balance → reconcile prompt.
- **Not shipped:** Android native `READ_SMS` (needs device/signing). Ambient
  real-time SMS toasts on a native wrapper.

### 2. Planning & Accountability Rituals · **the retention engine** — 🟡 partial
- **Shipped:** Spending plan, reflection/retro, balance reconciliation, commitment
  pacts, buffer suggestion on large cash-ins, impulse 24h pause, missions.
- **Not shipped:** Pushed morning money-minute / adaptive cadence / annual recap
  (needs engagement telemetry + cadence budget across nudges).

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

### The Family Mode Wedge — ✅ shipped (lite)
- Household plan snapshot + kids' allowance goals — `/family`
- Shared-wallet invites already in wallet sheet; deeper shared-plan mapping later

### Onboarding Enrichment — ✅ shipped
Primary goal, household/team size, notification ask, income range, gender,
starter savings goal seed.

### Money in & Automations — 🟡 partial
- Buffer suggestion, round-up + pay-yourself-first toggles, impulse pause — shipped
- **Still open:** Bank sync API; automatic round-up posting engine (toggle is on;
  auto-post on every expense can land next)

### Money management depth — 🟡 partial
- Envelope remaining UX, split expenses sheet — shipped
- **Still open:** Multi-currency FX conversion; full settle-up balances UI

### Intelligence & Trust — ✅ mostly shipped
- AI consent, audit trail + undo, Teach Penda, screen-aware AI, session rotation,
  ghost leaks, missions, blind budgeting, confidence score, live paywall preview
- **Still open:** Local market intelligence (external data); graduated-trust
  auto-loosening of confirmations

### Chat performance — ✅ shipped (SSE deferred)
- Parallel fetches, tool-progress Realtime cues, offline chat queue
- **Still open:** Full SSE token streaming (lifecycle cues cover the gap for now)

### Security & Data Control — ✅ shipped
App lock, data export, account deletion.

---

## Out of reach in this environment

- Android / Capacitor `READ_SMS` ambient ingest
- Live bank sync / MoMo invoicing rails
- Local market price feeds
