-- Scope challenge leaderboards to a wallet so multi-wallet users don't
-- inflate/deflate scores with unrelated activity.

alter table budget_challenges
  add column if not exists wallet_id uuid references wallets (id) on delete set null;

-- Recreate create_challenge with an optional wallet scope.
drop function if exists create_challenge(text, text, jsonb, date, date);

create function create_challenge(
  p_name text,
  p_type text,
  p_target_metric jsonb,
  p_start_date date,
  p_end_date date,
  p_wallet_id uuid default null
)
returns budget_challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge budget_challenges;
begin
  if p_type not in ('savings_target', 'spending_limit', 'no_spend_streak') then
    raise exception 'Invalid challenge type: %', p_type;
  end if;
  if p_end_date < p_start_date then
    raise exception 'End date must not be before start date';
  end if;
  if p_wallet_id is not null and not is_wallet_member(p_wallet_id, 'editor') then
    raise exception 'Not a member of that wallet';
  end if;

  insert into budget_challenges (name, creator_id, type, target_metric, start_date, end_date, wallet_id)
    values (p_name, auth.uid(), p_type, p_target_metric, p_start_date, p_end_date, p_wallet_id)
    returning * into v_challenge;

  insert into challenge_participants (challenge_id, user_id)
    values (v_challenge.id, auth.uid());

  return v_challenge;
end;
$$;

grant execute on function create_challenge(text, text, jsonb, date, date, uuid) to authenticated;

create or replace function get_challenge_leaderboard(p_challenge_id uuid)
returns table (user_id uuid, display_name text, value bigint, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_challenge budget_challenges;
  v_end date;
begin
  if not is_challenge_participant(p_challenge_id) then
    raise exception 'Not a participant of this challenge';
  end if;

  select * into v_challenge from budget_challenges where id = p_challenge_id;
  v_end := least(v_challenge.end_date, current_date);

  if v_challenge.type = 'savings_target' then
    return query
      select cp.user_id,
             coalesce(p.display_name, 'Member ' || substr(cp.user_id::text, 1, 4))::text,
             coalesce((
               select sum(sc.amount_minor) from savings_contributions sc
               join savings_goals g on g.id = sc.goal_id
               where sc.created_by = cp.user_id
                 and sc.contributed_date between v_challenge.start_date and v_end
                 and (v_challenge.wallet_id is null or g.wallet_id = v_challenge.wallet_id)
             ), 0)::bigint,
             cp.joined_at
      from challenge_participants cp
      left join profiles p on p.id = cp.user_id
      where cp.challenge_id = p_challenge_id
      order by 3 desc;

  elsif v_challenge.type = 'spending_limit' then
    return query
      select cp.user_id,
             coalesce(p.display_name, 'Member ' || substr(cp.user_id::text, 1, 4))::text,
             coalesce((
               select sum(t.amount_minor) from transactions t
               where t.created_by = cp.user_id
                 and t.type = 'expense'
                 and t.deleted_at is null
                 and t.user_confirmed
                 and t.transaction_date between v_challenge.start_date and v_end
                 and (v_challenge.wallet_id is null or t.wallet_id = v_challenge.wallet_id)
             ), 0)::bigint,
             cp.joined_at
      from challenge_participants cp
      left join profiles p on p.id = cp.user_id
      where cp.challenge_id = p_challenge_id
      order by 3 asc;

  else -- no_spend_streak: longest run of consecutive no-spend days in the window
    return query
      with per_user as (
        select cp2.user_id as uid, cp2.joined_at as ja
        from challenge_participants cp2
        where cp2.challenge_id = p_challenge_id
      ),
      days as (
        select d::date as day
        from generate_series(v_challenge.start_date, v_end, interval '1 day') d
      ),
      spend_days as (
        select t.created_by as uid, t.transaction_date as day
        from transactions t
        where t.type = 'expense'
          and t.deleted_at is null
          and t.user_confirmed
          and t.transaction_date between v_challenge.start_date and v_end
          and t.created_by in (select pu.uid from per_user pu)
          and (v_challenge.wallet_id is null or t.wallet_id = v_challenge.wallet_id)
        group by 1, 2
      ),
      flags as (
        select pu.uid, d.day, (sd.day is null) as no_spend
        from per_user pu
        cross join days d
        left join spend_days sd on sd.uid = pu.uid and sd.day = d.day
      ),
      runs as (
        select f.uid, f.no_spend,
               row_number() over (partition by f.uid order by f.day)
                 - row_number() over (partition by f.uid, f.no_spend order by f.day) as grp
        from flags f
      ),
      streaks as (
        select r.uid, count(*) as len from runs r where r.no_spend group by r.uid, r.grp
      ),
      best as (
        select s.uid, max(s.len) as best_len from streaks s group by s.uid
      )
      select pu.uid,
             coalesce(p.display_name, 'Member ' || substr(pu.uid::text, 1, 4))::text,
             coalesce(b.best_len, 0)::bigint,
             pu.ja
      from per_user pu
      left join profiles p on p.id = pu.uid
      left join best b on b.uid = pu.uid
      order by 3 desc;
  end if;
end;
$$;
