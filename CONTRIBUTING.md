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
npm run typecheck:edge
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
- **Database migrations**, **Supabase Edge Functions**, and **mobile builds** (EAS)
  are all manual — run `supabase db push`, `supabase functions deploy <name>`, or
  `npm run build:ios` / `npm run build:android` from your machine after merging.
  See `apps/mobile/README.md` for the mobile release checklist.

## Edge functions: typed Supabase client (required)

Every edge function must construct its client as `createClient<Database>(...)`, and
every helper that takes one as a parameter must type it `SupabaseClient<Database>`,
not the bare `SupabaseClient`. `Database` comes from
`supabase/functions/_shared/database.types.ts` (generated, not hand-edited).

This is what makes `npm run typecheck:edge` (part of `typecheck`, and a required CI
check) actually useful: a query that references a column that was renamed or dropped
in a migration fails typecheck instead of 500ing in production. This is exactly how
a query still using `accounts.kind`/`accounts.provider` after they were replaced by
`kind_id`/`provider_id` broke every chat message in production for weeks before
anyone noticed.

That protection only works if you **don't cast or `.returns<T>()` a query result** —
either of those silently discards the compiler's "this column doesn't exist" signal.
Map the fields you need off the naturally-inferred row instead:

```ts
// Bad: masks a bad select() — deno check passes even if `kind` doesn't exist.
return (data ?? []) as PocketAccount[]

// Good: accessing row.kind fails typecheck if the column is wrong.
return (data ?? []).map((row) => ({ id: row.id, kind: row.kind, ... }))
```

If a column is legitimately a DB check-constrained `text` (not a Postgres enum) and
you need a narrower literal type than the generated `string`, cast only that one
field in the map, not the whole row — e.g. `match_type: row.match_type as
CategorizationRule['match_type']`. For `jsonb` columns on insert/update, the
generated `Json` type has no index signature for named interfaces, so cast the value
being written (`as unknown as Json`) — that's a shape mismatch on the way in, not a
column-existence check, so it's safe.

After any migration that adds, renames, or drops a column/table, regenerate types
before opening the PR:

```bash
npm run gen:types
```

Commit the regenerated `database.types.ts` alongside the migration.
