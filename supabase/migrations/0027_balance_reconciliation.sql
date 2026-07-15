-- Balance reconciliation — the trust anchor (roadmap bet #2). A lightweight
-- daily "Penda has KX — does that match your MoMo?" check-in so the computed
-- balance never silently drifts from reality unnoticed. Everything downstream
-- (safe-to-spend, the cashflow timeline, the simulation engine) is only as
-- trustworthy as this match.
create table balance_reconciliations (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  computed_balance_minor bigint not null,
  actual_balance_minor bigint not null,
  status text not null check (status in ('confirmed', 'adjusted')),
  created_at timestamptz not null default now()
);

create index balance_reconciliations_wallet_user_idx
  on balance_reconciliations (wallet_id, user_id, created_at desc);

alter table balance_reconciliations enable row level security;

create policy "select if member" on balance_reconciliations
  for select using (is_wallet_member(wallet_id, 'viewer'));
create policy "insert own if member" on balance_reconciliations
  for insert with check (user_id = auth.uid() and is_wallet_member(wallet_id, 'viewer'));
