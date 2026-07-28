-- Web push hardening: timezone-aware quiet hours, delivery attempts, retry outbox,
-- subscription health fields, notification open tracking, realtime inbox.

alter table profiles
  add column if not exists timezone text;

comment on column profiles.timezone is
  'IANA timezone (e.g. Africa/Lusaka) for quiet hours and local scheduling.';

alter table push_subscriptions
  add column if not exists user_agent text,
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists failure_count integer not null default 0,
  add column if not exists disabled_at timestamptz;

create index if not exists push_subscriptions_user_active_idx
  on push_subscriptions (user_id)
  where disabled_at is null;

alter table notifications
  add column if not exists push_sent_at timestamptz,
  add column if not exists opened_at timestamptz;

create table if not exists push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  subscription_id uuid references push_subscriptions (id) on delete set null,
  notification_id uuid references notifications (id) on delete set null,
  status text not null check (status in ('sent', 'failed', 'gone', 'skipped')),
  status_code integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists push_delivery_attempts_user_created_idx
  on push_delivery_attempts (user_id, created_at desc);

create index if not exists push_delivery_attempts_notification_idx
  on push_delivery_attempts (notification_id)
  where notification_id is not null;

alter table push_delivery_attempts enable row level security;

create policy "select own push delivery attempts"
  on push_delivery_attempts for select
  using (user_id = auth.uid());

-- Retry queue for transient Web Push failures (429/5xx/network).
create table if not exists push_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  subscription_id uuid not null references push_subscriptions (id) on delete cascade,
  notification_id uuid references notifications (id) on delete set null,
  payload jsonb not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists push_outbox_due_idx
  on push_outbox (next_attempt_at, created_at)
  where attempts < 5;

alter table push_outbox enable row level security;
-- No client policies: service role only.

-- Track when a user opens a notification (inbox or push click).
create or replace function record_notification_open(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update notifications
    set
      opened_at = coalesce(opened_at, now()),
      read_at = coalesce(read_at, now())
    where id = p_id
      and user_id = auth.uid();
end;
$$;

revoke all on function record_notification_open(uuid) from public;
grant execute on function record_notification_open(uuid) to authenticated;

grant execute on function check_rate_limit(uuid, text, integer, integer) to service_role;

-- Realtime inbox updates for the web client.
do $$
begin
  alter publication supabase_realtime add table notifications;
exception
  when duplicate_object then null;
end $$;

-- Retry transient push failures every 5 minutes.
select
  cron.schedule(
    'push-outbox-retry',
    '*/5 * * * *',
    $$
    select net.http_post(
      url := 'https://vnlfnepnhbkgwqthzxds.supabase.co/functions/v1/push-retry',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
    $$
  );

-- Keep delivery logs from growing forever.
select
  cron.schedule(
    'cleanup-push-delivery-attempts',
    '20 3 * * *',
    $$ delete from push_delivery_attempts where created_at < now() - interval '30 days'; $$
  );
