-- Round-up + pay-yourself-first auto-post engine.

alter table profiles
  add column if not exists habits_goal_id uuid references savings_goals (id) on delete set null;

alter table savings_contributions
  add column if not exists source_transaction_id uuid references transactions (id) on delete set null,
  add column if not exists automation_kind text
    check (automation_kind is null or automation_kind in ('round_up', 'pay_yourself_first'));

create unique index if not exists savings_contributions_automation_uidx
  on savings_contributions (source_transaction_id, automation_kind)
  where source_transaction_id is not null and automation_kind is not null;

create or replace function apply_money_habits(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx record;
  v_profile record;
  v_goal_id uuid;
  v_unit bigint := 100;
  v_spare bigint;
  v_pyf bigint;
  v_results jsonb;
begin
  select t.*
    into v_tx
  from transactions t
  where t.id = p_transaction_id
    and t.deleted_at is null
    and coalesce(t.user_confirmed, true) = true;

  if not found then
    return jsonb_build_object('applied', false, 'reason', 'transaction_not_found');
  end if;

  if auth.uid() is null or not is_wallet_member(v_tx.wallet_id, 'editor') then
    raise exception 'not authorized';
  end if;

  select p.id, p.round_up_enabled, p.pay_yourself_first_pct, p.habits_goal_id
    into v_profile
  from profiles p
  where p.id = auth.uid();

  if not found then
    return jsonb_build_object('applied', false, 'reason', 'no_profile');
  end if;

  if not v_profile.round_up_enabled and coalesce(v_profile.pay_yourself_first_pct, 0) <= 0 then
    return jsonb_build_object('applied', false, 'reason', 'habits_off');
  end if;

  v_goal_id := v_profile.habits_goal_id;
  if v_goal_id is not null and not exists (
    select 1 from savings_goals g
    where g.id = v_goal_id and g.wallet_id = v_tx.wallet_id
  ) then
    v_goal_id := null;
  end if;

  if v_goal_id is null then
    select g.id into v_goal_id
    from savings_goals g
    where g.wallet_id = v_tx.wallet_id
      and g.name = 'Round-ups & savings'
    limit 1;

    if v_goal_id is null then
      insert into savings_goals (
        wallet_id, name, icon, target_amount_minor, current_amount_minor, motivation
      ) values (
        v_tx.wallet_id,
        'Round-ups & savings',
        '🪙',
        100000,
        0,
        'Automatic round-ups and pay-yourself-first'
      )
      returning id into v_goal_id;
    end if;

    update profiles set habits_goal_id = v_goal_id where id = v_profile.id;
  end if;

  if v_tx.type = 'expense' and v_profile.round_up_enabled then
    v_spare := (ceil(v_tx.amount_minor::numeric / v_unit) * v_unit)::bigint - v_tx.amount_minor;
    if v_spare > 0 then
      insert into savings_contributions (
        goal_id, amount_minor, contributed_date, source_transaction_id, automation_kind
      ) values (
        v_goal_id, v_spare, v_tx.transaction_date, v_tx.id, 'round_up'
      )
      on conflict do nothing;
    end if;
  end if;

  if v_tx.type = 'income' and coalesce(v_profile.pay_yourself_first_pct, 0) > 0 then
    v_pyf := floor(v_tx.amount_minor * v_profile.pay_yourself_first_pct / 100.0)::bigint;
    if v_pyf > 0 then
      insert into savings_contributions (
        goal_id, amount_minor, contributed_date, source_transaction_id, automation_kind
      ) values (
        v_goal_id, v_pyf, v_tx.transaction_date, v_tx.id, 'pay_yourself_first'
      )
      on conflict do nothing;
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'kind', c.automation_kind,
        'amount_minor', c.amount_minor,
        'goal_id', c.goal_id
      )
    ),
    '[]'::jsonb
  )
    into v_results
  from savings_contributions c
  where c.source_transaction_id = v_tx.id;

  return jsonb_build_object(
    'applied', jsonb_array_length(v_results) > 0,
    'contributions', v_results
  );
end;
$$;

revoke all on function apply_money_habits(uuid) from public;
grant execute on function apply_money_habits(uuid) to authenticated;
