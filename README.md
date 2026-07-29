# Penda

Penda is an AI-first money companion — web and mobile clients backed by
Supabase, with an AI chat assistant that can read and act on your finances.

## Monorepo layout

```
apps/web        React + Vite web app (deploys to Vercel)
apps/mobile     Expo Router iOS/Android app — see apps/mobile/README.md
packages/money-core    Shared money math (balances, cashflow, parsing) used by web + mobile
packages/shared-types  Shared Zod schemas/types
supabase/functions     Deno Edge Functions (chat, insights, reminders, ...)
supabase/migrations    SQL migrations
```

## Stack

- **Web**: React 19, Vite, TanStack Query, Tailwind, Zustand
- **Mobile**: Expo SDK 57, Expo Router, Reanimated
- **Backend**: Supabase (Postgres, Auth, Realtime, Storage, Edge Functions)
- **Shared**: npm workspaces, Vitest (web/mobile/money-core), Deno test (edge functions)

## Setup

```bash
npm install
npm run dev:web       # web app
npm run dev:mobile     # Expo dev server (or npm run ios / npm run android)
```

See `apps/mobile/README.md` for mobile-specific env setup, SMS ingest, and EAS store release steps.

## Everyday commands

| Command | Runs |
|---|---|
| `npm run typecheck` | TypeScript across all workspaces |
| `npm run build` | Web production build |
| `npm run lint` | Lint across all workspaces |
| `npm run test` | All test suites (web, mobile, money-core, edge functions) |
| `npm run test:web` / `test:mobile` / `test:money-core` / `test:edge` | A single workspace's tests |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branching model and PR process.
