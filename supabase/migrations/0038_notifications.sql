-- In-app notifications inbox + per-category prefs.
-- Writers: Edge Functions (service role) and upsert_coaching_notification (member RPC).
-- Clients: select/update own rows (read/archive); no direct insert.

alter table profiles
  add column if not exists notification_prefs jsonb not null default '{
    "reminders": true,
    "tips": true,
    "insights": true,
    "alerts": true,
    "updates": true
  }'::jsonb;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  wallet_id uuid references wallets (id) on delete set null,
  kind text not null check (kind in ('tip', 'reminder', 'insight', 'update', 'alert')),
  title text not null,
  body text not null,
  href text not null default '/notifications',
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  -- NULLs are distinct in Postgres UNIQUE, so rows without a key may coexist.
  unique (user_id, dedupe_key)
);

create index notifications_user_created_idx
  on notifications (user_id, created_at desc);

create index notifications_user_unread_idx
  on notifications (user_id)
  where read_at is null and archived_at is null;

alter table notifications enable row level security;

create policy "select own notifications"
  on notifications for select
  using (user_id = auth.uid());

create policy "update own notifications"
  on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Mark specific ids (or all unread) as read for the caller.
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_ids is null then
    update notifications
      set read_at = coalesce(read_at, now())
      where user_id = auth.uid()
        and read_at is null
        and archived_at is null;
  else
    update notifications
      set read_at = coalesce(read_at, now())
      where user_id = auth.uid()
        and id = any (p_ids)
        and read_at is null;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function mark_notifications_read(uuid[]) from public;
grant execute on function mark_notifications_read(uuid[]) to authenticated;

-- Home coaching tip → durable inbox row (at most one per dedupe_key).
create or replace function upsert_coaching_notification(
  p_wallet_id uuid,
  p_title text,
  p_body text,
  p_href text,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prefs jsonb;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_dedupe_key is null or length(trim(p_dedupe_key)) = 0 then
    raise exception 'dedupe_key required';
  end if;

  if not is_wallet_member(p_wallet_id, 'viewer') then
    raise exception 'Not a wallet member';
  end if;

  select notification_prefs into v_prefs from profiles where id = v_uid;
  if coalesce((v_prefs ->> 'tips')::boolean, true) is not true then
    return null;
  end if;

  insert into notifications (user_id, wallet_id, kind, title, body, href, dedupe_key, payload)
  values (
    v_uid,
    p_wallet_id,
    'tip',
    p_title,
    p_body,
    coalesce(nullif(trim(p_href), ''), '/budgets'),
    p_dedupe_key,
    jsonb_build_object('source', 'coaching')
  )
  on conflict (user_id, dedupe_key)
  do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from notifications
    where user_id = v_uid and dedupe_key = p_dedupe_key
    limit 1;
  end if;

  return v_id;
end;
$$;

revoke all on function upsert_coaching_notification(uuid, text, text, text, text) from public;
grant execute on function upsert_coaching_notification(uuid, text, text, text, text) to authenticated;
