-- Budgets progress tracking + recurring transaction automation.

alter table transactions drop constraint transactions_source_check;
alter table transactions add constraint transactions_source_check
  check (source in ('manual', 'chat', 'voice', 'receipt', 'recurring'));

alter table budgets add column updated_at timestamptz not null default now();
alter table recurring_transactions add column updated_at timestamptz not null default now();
alter table recurring_transactions add column created_by uuid not null references profiles (id);

create trigger set_updated_at before update on budgets
  for each row execute function set_updated_at();
create trigger set_updated_at before update on recurring_transactions
  for each row execute function set_updated_at();

-- Spend-to-date per budget, scoped to the budget's current weekly/monthly
-- period. Computed server-side (never merged client-side) so every member
-- of a shared wallet sees the same remaining amount.
create or replace function get_budget_progress(p_wallet_id uuid)
returns table (
  budget_id uuid,
  category_id uuid,
  amount_minor bigint,
  period text,
  rollover boolean,
  period_start date,
  period_end date,
  spent_minor bigint
)
language sql
security definer
set search_path = public
as $$
  with periods as (
    select
      b.id as budget_id,
      b.category_id,
      b.amount_minor,
      b.period,
      b.rollover,
      case b.period
        when 'weekly' then date_trunc('week', current_date)::date
        else date_trunc('month', current_date)::date
      end as period_start,
      case b.period
        when 'weekly' then (date_trunc('week', current_date) + interval '6 days')::date
        else (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
      end as period_end
    from budgets b
    where b.wallet_id = p_wallet_id
      and is_wallet_member(p_wallet_id, 'viewer')
  )
  select
    p.budget_id, p.category_id, p.amount_minor, p.period, p.rollover, p.period_start, p.period_end,
    coalesce((
      select sum(t.amount_minor) from transactions t
      where t.wallet_id = p_wallet_id
        and t.deleted_at is null
        and t.user_confirmed
        and t.type = 'expense'
        and (p.category_id is null or t.category_id = p.category_id)
        and t.transaction_date between p.period_start and p.period_end
    ), 0) as spent_minor
  from periods p;
$$;

grant execute on function get_budget_progress(uuid) to authenticated;

-- Daily job: turn any due recurring_transactions into real transactions and
-- roll each forward to its next occurrence.
create or replace function materialize_recurring_transactions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_next_date date;
begin
  for rec in
    select * from recurring_transactions
    where is_active and next_run_date <= current_date
  loop
    insert into transactions (
      wallet_id, created_by, category_id, amount_minor, currency,
      type, merchant, description, transaction_date, source, user_confirmed
    ) values (
      rec.wallet_id,
      rec.created_by,
      nullif(rec.template->>'category_id', '')::uuid,
      (rec.template->>'amount_minor')::bigint,
      coalesce(rec.template->>'currency', 'USD'),
      coalesce(rec.template->>'type', 'expense'),
      rec.template->>'merchant',
      rec.template->>'description',
      rec.next_run_date,
      'recurring',
      true
    );

    v_next_date := case rec.frequency
      when 'daily' then rec.next_run_date + 1
      when 'weekly' then rec.next_run_date + 7
      when 'monthly' then (rec.next_run_date + interval '1 month')::date
      when 'yearly' then (rec.next_run_date + interval '1 year')::date
    end;

    update recurring_transactions
      set last_run_date = rec.next_run_date, next_run_date = v_next_date
      where id = rec.id;
  end loop;
end;
$$;

select cron.schedule(
  'materialize-recurring-transactions',
  '5 0 * * *',
  $$select materialize_recurring_transactions()$$
);
