-- Spending Plan Object (roadmap bet 2): a top-level monthly intention
-- ("this month I intend to spend K12k") tracked against actuals, plus an
-- end-of-month reflection prompt — the plan → act → reflect loop.
create table spending_plans (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  month date not null,
  intended_amount_minor bigint not null,
  reflection text,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wallet_id, month)
);

alter table spending_plans enable row level security;

create policy "select if member" on spending_plans for select using (is_wallet_member(wallet_id, 'viewer'));
create policy "write if editor" on spending_plans for insert with check (is_wallet_member(wallet_id, 'editor'));
create policy "update if editor" on spending_plans for update using (is_wallet_member(wallet_id, 'editor'));
create policy "delete if owner" on spending_plans for delete using (is_wallet_member(wallet_id, 'owner'));

create trigger set_updated_at before update on spending_plans
  for each row execute function set_updated_at();
