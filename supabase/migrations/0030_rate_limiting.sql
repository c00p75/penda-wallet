-- Per-user, per-endpoint request quotas for the AI chat/voice edge functions.
-- Audit finding: no rate limiting existed anywhere on chat-message or
-- transcribe-voice, so a single account could run up unbounded Gemini/Groq
-- spend. Fixed-window counting, checked atomically via an upsert-and-return.

create table api_rate_limits (
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, endpoint, window_start)
);

-- No RLS needed: only ever touched via this security-definer function, called
-- from edge functions running as the authenticated user's own request.
alter table api_rate_limits enable row level security;

-- Atomically bump the counter for the current fixed window and report whether
-- the caller is still under the cap. security definer so the edge function's
-- anon+JWT client can call it without needing table-level insert/update grants.
create or replace function check_rate_limit(p_user_id uuid, p_endpoint text, p_max_requests integer, p_window_minutes integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60));

  insert into api_rate_limits (user_id, endpoint, window_start, request_count)
  values (p_user_id, p_endpoint, v_window_start, 1)
  on conflict (user_id, endpoint, window_start)
  do update set request_count = api_rate_limits.request_count + 1
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

grant execute on function check_rate_limit(uuid, text, integer, integer) to authenticated;

-- Windows are cheap and small (one row per active user per endpoint per
-- window), but nothing ever deletes old ones — sweep daily so the table
-- doesn't grow unbounded over the life of the app.
select
  cron.schedule(
    'cleanup-rate-limits',
    '0 3 * * *',
    $$ delete from api_rate_limits where window_start < now() - interval '1 day'; $$
  );
