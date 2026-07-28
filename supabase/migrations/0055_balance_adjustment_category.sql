-- Dedicated system category for balance reconciliation deltas so corrections
-- show clearly in the ledger and can be excluded from overall budgets / spend
-- summaries (they are not lifestyle spending).

insert into categories (name, icon, color, is_system)
select 'Balance adjustment', 'scale', '#78716c', true
where not exists (
  select 1
  from categories
  where wallet_id is null
    and is_system
    and name = 'Balance adjustment'
);

-- Point existing reconciliation deltas at the new category.
update transactions t
set category_id = c.id
from categories c
where c.wallet_id is null
  and c.is_system
  and c.name = 'Balance adjustment'
  and t.category_id is null
  and t.deleted_at is null
  and t.description = 'Balance reconciliation adjustment';

-- Exclude Balance adjustment from overall-budget spend (category_id is null).
-- Category-specific budgets already ignore it via the category_id match.
create or replace function get_budget_progress(p_wallet_id uuid)
returns table (
  budget_id uuid,
  category_id uuid,
  amount_minor bigint,
  period text,
  rollover boolean,
  period_start date,
  period_end date,
  spent_minor bigint,
  carried_over_minor bigint,
  effective_amount_minor bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  v_period_start date;
  v_period_end date;
  v_spent_minor bigint;
  v_hist_start date;
  v_hist_end date;
  v_hist_spent bigint;
  v_carry bigint;
  v_guard int;
begin
  -- End-user sessions still require membership; service-role (auth.uid null) may read.
  if auth.uid() is not null and not is_wallet_member(p_wallet_id, 'viewer') then
    return;
  end if;

  for b in
    select id, category_id, amount_minor, period, rollover, start_date
    from budgets
    where wallet_id = p_wallet_id
  loop
    if b.period = 'weekly' then
      v_period_start := date_trunc('week', current_date)::date;
      v_period_end := v_period_start + 6;
    else
      v_period_start := date_trunc('month', current_date)::date;
      v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;
    end if;

    select coalesce(sum(t.amount_minor), 0) into v_spent_minor
    from transactions t
    left join categories c on c.id = t.category_id
    where t.wallet_id = p_wallet_id
      and t.deleted_at is null
      and t.user_confirmed
      and t.type = 'expense'
      and (b.category_id is null or t.category_id = b.category_id)
      and (b.category_id is not null or coalesce(c.name, '') <> 'Balance adjustment')
      and t.transaction_date between v_period_start and v_period_end;

    v_carry := 0;

    if b.rollover then
      v_hist_start := case b.period
        when 'weekly' then date_trunc('week', b.start_date)::date
        else date_trunc('month', b.start_date)::date
      end;

      v_guard := 0;
      while v_hist_start < v_period_start and v_guard < 260 loop
        v_hist_end := case b.period
          when 'weekly' then v_hist_start + 6
          else (v_hist_start + interval '1 month' - interval '1 day')::date
        end;

        select coalesce(sum(t.amount_minor), 0) into v_hist_spent
        from transactions t
        left join categories c on c.id = t.category_id
        where t.wallet_id = p_wallet_id
          and t.deleted_at is null
          and t.user_confirmed
          and t.type = 'expense'
          and (b.category_id is null or t.category_id = b.category_id)
          and (b.category_id is not null or coalesce(c.name, '') <> 'Balance adjustment')
          and t.transaction_date between v_hist_start and v_hist_end;

        v_carry := v_carry + (b.amount_minor - v_hist_spent);

        v_hist_start := case b.period
          when 'weekly' then v_hist_start + 7
          else (v_hist_start + interval '1 month')::date
        end;
        v_guard := v_guard + 1;
      end loop;
    end if;

    budget_id := b.id;
    category_id := b.category_id;
    amount_minor := b.amount_minor;
    period := b.period;
    rollover := b.rollover;
    period_start := v_period_start;
    period_end := v_period_end;
    spent_minor := v_spent_minor;
    carried_over_minor := v_carry;
    effective_amount_minor := b.amount_minor + v_carry;

    return next;
  end loop;
end;
$$;

grant execute on function get_budget_progress(uuid) to authenticated, service_role;

-- Chat spend summaries should treat reconciliation deltas as non-spending.
create or replace function get_wallet_spending_summary(p_wallet_id uuid, p_since date, p_until date)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'expense_minor',  coalesce(sum(t.amount_minor) filter (
      where t.type = 'expense'
        and not exists (
          select 1 from categories c
          where c.id = t.category_id
            and c.is_system
            and c.wallet_id is null
            and c.name = 'Balance adjustment'
        )
    ), 0),
    'income_minor',   coalesce(sum(t.amount_minor) filter (
      where t.type = 'income'
        and not exists (
          select 1 from categories c
          where c.id = t.category_id
            and c.is_system
            and c.wallet_id is null
            and c.name = 'Balance adjustment'
        )
    ), 0),
    'expense_count',  count(*) filter (
      where t.type = 'expense'
        and not exists (
          select 1 from categories c
          where c.id = t.category_id
            and c.is_system
            and c.wallet_id is null
            and c.name = 'Balance adjustment'
        )
    ),
    'top_categories', coalesce((
      select jsonb_agg(
               jsonb_build_object('name', top.name, 'amount_minor', top.total)
               order by top.total desc
             )
      from (
        select coalesce(c.name, 'Uncategorized') as name, sum(t2.amount_minor) as total
        from transactions t2
        left join categories c on c.id = t2.category_id
        where t2.wallet_id = p_wallet_id
          and t2.deleted_at is null
          and t2.type = 'expense'
          and t2.transaction_date between p_since and p_until
          and coalesce(c.name, '') <> 'Balance adjustment'
        group by 1
        order by total desc
        limit 3
      ) top
    ), '[]'::jsonb)
  )
  from transactions t
  where t.wallet_id = p_wallet_id
    and t.deleted_at is null
    and t.transaction_date between p_since and p_until;
$$;

grant execute on function get_wallet_spending_summary(uuid, date, date) to authenticated;
