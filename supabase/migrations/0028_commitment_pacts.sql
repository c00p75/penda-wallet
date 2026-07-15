-- Commitment Pacts (roadmap bet #2): "No takeout this week" — Penda holds you
-- to it. A pact restricts a category over a date window; status (active /
-- kept / broken) is computed from transactions rather than stored, same
-- reasoning as get_budget_progress — no cron needed to keep it fresh, and it
-- can never drift out of sync with the ledger.
create table commitment_pacts (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  created_by uuid not null references profiles (id),
  description text not null,
  category_id uuid references categories (id) on delete set null,
  start_date date not null default current_date,
  end_date date not null,
  created_at timestamptz not null default now()
);

create index commitment_pacts_wallet_idx on commitment_pacts (wallet_id, end_date desc);

alter table commitment_pacts enable row level security;

create policy "select if member" on commitment_pacts
  for select using (is_wallet_member(wallet_id, 'viewer'));
create policy "insert if editor" on commitment_pacts
  for insert with check (is_wallet_member(wallet_id, 'editor'));
create policy "delete if owner" on commitment_pacts
  for delete using (is_wallet_member(wallet_id, 'owner'));
