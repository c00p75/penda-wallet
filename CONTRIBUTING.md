# Contributing

## Branching model (GitHub Flow)

`main` is always deployable — web deploys to Vercel and Edge Functions deploy
to Supabase automatically on every merge to `main`.

1. Branch off `main`: `feat/short-description`, `fix/short-description`, or `chore/short-description`.
2. Commit and push. Open a PR into `main`.
3. CI must pass (typecheck, build, lint, tests) before merge — this is enforced by
   branch protection, not just convention.
4. Squash-merge, then delete the branch.

There's no mandatory reviewer yet while the team is small, but CI passing is a hard
requirement — a PR with a red check cannot be merged.

## Before opening a PR

```bash
npm run typecheck
npm run lint
npm run test
```

A pre-commit hook runs lint automatically on the workspaces you touched, but running
the full set locally before pushing saves a round trip through CI.

## Commits

Write plain, descriptive commit messages (imperative mood, e.g. "Fix wallet balance
rounding" not "Fixed" or "Fixes"). No enforced prefix convention.

## Deploys

- **Web**: Vercel deploys `main` automatically on merge.
- **Supabase Edge Functions**: deployed automatically on merge to `main` via CI
  (see `.github/workflows/ci.yml`).
- **Database migrations** (`supabase/migrations`) and **mobile builds** (EAS) are
  still manual — run `supabase db push` / `npm run build:ios` / `npm run build:android`
  from your machine. See `apps/mobile/README.md` for the mobile release checklist.
