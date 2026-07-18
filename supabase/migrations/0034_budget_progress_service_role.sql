-- Allow the burn-rate cron (service role) to read effective budget caps,
-- including rollover carry, the same way the UI does via get_budget_progress.

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
    where t.wallet_id = p_wallet_id
      and t.deleted_at is null
      and t.user_confirmed
      and t.type = 'expense'
      and (b.category_id is null or t.category_id = b.category_id)
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
        where t.wallet_id = p_wallet_id
          and t.deleted_at is null
          and t.user_confirmed
          and t.type = 'expense'
          and (b.category_id is null or t.category_id = b.category_id)
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
