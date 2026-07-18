-- Family shared-plan mapping: per-member allocations + allowance assignment.

alter table savings_goals
  add column if not exists assigned_member_id uuid references profiles (id) on delete set null;

create table if not exists spending_plan_shares (
  plan_id uuid not null references spending_plans (id) on delete cascade,
  member_id uuid not null references profiles (id) on delete cascade,
  allocated_minor bigint not null check (allocated_minor >= 0),
  primary key (plan_id, member_id)
);

create index if not exists spending_plan_shares_member_idx
  on spending_plan_shares (member_id);

alter table spending_plan_shares enable row level security;

create policy "select plan shares if member" on spending_plan_shares
  for select using (
    exists (
      select 1 from spending_plans p
      where p.id = plan_id and is_wallet_member(p.wallet_id, 'viewer')
    )
  );

create policy "write plan shares if editor" on spending_plan_shares
  for all using (
    exists (
      select 1 from spending_plans p
      where p.id = plan_id and is_wallet_member(p.wallet_id, 'editor')
    )
  );
