-- Companion enhancements: prefs, check-ins, weekly letters, deferred questions.

alter table profiles
  add column if not exists companion_prefs jsonb not null
    default '{
      "quiet_enabled": false,
      "quiet_after_hour": 21,
      "quiet_before_hour": 8,
      "quiet_on_sundays": false,
      "quiet_when_stressed": true,
      "weekly_letter": true,
      "pact_follow_up": true,
      "payday_companion": true,
      "continuity_openers": true,
      "family_nudges": true
    }'::jsonb;

create table if not exists companion_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  wallet_id uuid not null references wallets (id) on delete cascade,
  kind text not null
    check (kind in ('pact', 'impulse', 'payday', 'teach_back', 'weekly_letter', 'family')),
  ref_id text,
  message text not null,
  status text not null default 'pending'
    check (status in ('pending', 'kept', 'slipped', 'dismissed', 'answered')),
  due_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text
);

create unique index if not exists companion_checkins_user_dedupe_uidx
  on companion_checkins (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists companion_checkins_wallet_pending_idx
  on companion_checkins (wallet_id, status, due_at)
  where status = 'pending';

alter table companion_checkins enable row level security;

create policy companion_checkins_select_own
  on companion_checkins for select
  using (auth.uid() = user_id);

create policy companion_checkins_update_own
  on companion_checkins for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy companion_checkins_insert_own
  on companion_checkins for insert
  with check (auth.uid() = user_id);

create table if not exists companion_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  wallet_id uuid not null references wallets (id) on delete cascade,
  title text not null,
  body text not null,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now()
);

create index if not exists companion_letters_wallet_created_idx
  on companion_letters (wallet_id, created_at desc);

alter table companion_letters enable row level security;

create policy companion_letters_select_own
  on companion_letters for select
  using (auth.uid() = user_id);

create table if not exists deferred_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  wallet_id uuid not null references wallets (id) on delete cascade,
  question text not null,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'asked', 'dismissed', 'answered')),
  ask_after timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists deferred_questions_wallet_pending_idx
  on deferred_questions (wallet_id, status, ask_after)
  where status = 'pending';

alter table deferred_questions enable row level security;

create policy deferred_questions_all_own
  on deferred_questions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Daily companion rituals (pact / payday / family nudges) @ 15:00 UTC
select
  cron.schedule(
    'daily-companion-rituals',
    '0 15 * * *',
    $$
    select net.http_post(
      url := 'https://vnlfnepnhbkgwqthzxds.supabase.co/functions/v1/companion-rituals',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{"job":"daily"}'::jsonb
    );
    $$
  );

-- Weekly persona letter Sundays 16:00 UTC
select
  cron.schedule(
    'weekly-companion-letter',
    '0 16 * * 0',
    $$
    select net.http_post(
      url := 'https://vnlfnepnhbkgwqthzxds.supabase.co/functions/v1/companion-rituals',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{"job":"weekly_letter"}'::jsonb
    );
    $$
  );
