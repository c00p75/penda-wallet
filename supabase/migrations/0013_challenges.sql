-- Budget challenges: invite-code joining, participant visibility, and
-- server-computed leaderboards. Progress is always derived from the
-- participant's own rows (created_by) server-side — participants never
-- gain access to each other's transactions, only to the aggregate.

alter table budget_challenges add column invite_code text not null unique
  default substr(md5(random()::text), 1, 8);
alter table budget_challenges add column updated_at timestamptz not null default now();

create trigger set_updated_at before update on budget_challenges
  for each row execute function set_updated_at();

-- Challenge progress needs per-user attribution of savings.
alter table savings_contributions add column created_by uuid references profiles (id) default auth.uid();

create function is_challenge_participant(p_challenge_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from challenge_participants
    where challenge_id = p_challenge_id and user_id = auth.uid()
  ) or exists (
    select 1 from budget_challenges
    where id = p_challenge_id and creator_id = auth.uid()
  );
$$;

-- Participants of the same challenge can see each other (needed for the
-- leaderboard); previously only the creator could.
drop policy "select participants of visible challenges" on challenge_participants;
create policy "participants see fellow participants" on challenge_participants
  for select using (is_challenge_participant(challenge_id));

create function create_challenge(
  p_name text,
  p_type text,
  p_target_metric jsonb,
  p_start_date date,
  p_end_date date
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

  insert into budget_challenges (name, creator_id, type, target_metric, start_date, end_date)
    values (p_name, auth.uid(), p_type, p_target_metric, p_start_date, p_end_date)
    returning * into v_challenge;

  insert into challenge_participants (challenge_id, user_id)
    values (v_challenge.id, auth.uid());

  return v_challenge;
end;
$$;

grant execute on function create_challenge(text, text, jsonb, date, date) to authenticated;

create function join_challenge(p_invite_code text)
returns budget_challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge budget_challenges;
begin
  select * into v_challenge from budget_challenges
    where invite_code = lower(trim(p_invite_code));

  if v_challenge.id is null then
    raise exception 'No challenge found for that code';
  end if;
  if current_date > v_challenge.end_date then
    raise exception 'This challenge has already ended';
  end if;

  insert into challenge_participants (challenge_id, user_id)
    values (v_challenge.id, auth.uid())
    on conflict do nothing;

  return v_challenge;
end;
$$;

grant execute on function join_challenge(text) to authenticated;

create function get_challenge_leaderboard(p_challenge_id uuid)
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
               where sc.created_by = cp.user_id
                 and sc.contributed_date between v_challenge.start_date and v_end
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

grant execute on function get_challenge_leaderboard(uuid) to authenticated;
