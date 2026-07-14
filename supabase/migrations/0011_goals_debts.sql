-- Savings goal contributions and debt payment history, each keeping a
-- cached running total on the parent row in sync via trigger (same pattern
-- as wallets.is_shared) so list views never need a join+sum.

alter table savings_goals add column updated_at timestamptz not null default now();
alter table debts add column updated_at timestamptz not null default now();

create trigger set_updated_at before update on savings_goals
  for each row execute function set_updated_at();
create trigger set_updated_at before update on debts
  for each row execute function set_updated_at();

create table savings_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references savings_goals (id) on delete cascade,
  amount_minor bigint not null,
  contributed_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table savings_contributions enable row level security;

create policy "select contributions if member" on savings_contributions for select using (
  exists (select 1 from savings_goals g where g.id = goal_id and is_wallet_member(g.wallet_id, 'viewer'))
);
create policy "write contributions if editor" on savings_contributions for all using (
  exists (select 1 from savings_goals g where g.id = goal_id and is_wallet_member(g.wallet_id, 'editor'))
);

create function sync_savings_goal_amount()
returns trigger
security definer set search_path = public
language plpgsql
as $$
declare
  v_goal_id uuid := coalesce(new.goal_id, old.goal_id);
begin
  update savings_goals
    set current_amount_minor = (
      select coalesce(sum(amount_minor), 0) from savings_contributions where goal_id = v_goal_id
    )
    where id = v_goal_id;
  return null;
end;
$$;

create trigger on_savings_contribution_change
  after insert or update or delete on savings_contributions
  for each row execute function sync_savings_goal_amount();

create function sync_debt_balance()
returns trigger
security definer set search_path = public
language plpgsql
as $$
declare
  v_debt_id uuid := coalesce(new.debt_id, old.debt_id);
begin
  update debts
    set balance_minor = principal_minor - (
      select coalesce(sum(amount_minor), 0) from debt_payments where debt_id = v_debt_id
    )
    where id = v_debt_id;
  return null;
end;
$$;

create trigger on_debt_payment_change
  after insert or update or delete on debt_payments
  for each row execute function sync_debt_balance();
