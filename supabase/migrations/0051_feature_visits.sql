-- Tracks which app pages a wallet has visited, so the AI companion can nudge
-- users toward features they haven't tried yet.
create table if not exists feature_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  wallet_id uuid not null references wallets (id) on delete cascade,
  page text not null,
  first_visited_at timestamptz not null default now(),
  last_visited_at timestamptz not null default now()
);

create unique index if not exists feature_visits_wallet_page_idx
  on feature_visits (wallet_id, page);

alter table feature_visits enable row level security;

create policy feature_visits_select_own
  on feature_visits for select
  using (auth.uid() = user_id);

create policy feature_visits_insert_own
  on feature_visits for insert
  with check (auth.uid() = user_id);

create policy feature_visits_update_own
  on feature_visits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
