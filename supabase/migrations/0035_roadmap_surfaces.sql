-- Roadmap surfaces: AI consent / automations on profiles, financial missions,
-- and Splitwise-style expense splits (schema only — settle-up UI later).

alter table profiles
  add column if not exists ai_consent jsonb not null
    default '{"auto_log_sms":true,"act_without_confirm":false,"parse_clipboard":true,"unprompted_coaching":true}'::jsonb,
  add column if not exists blind_budgeting boolean not null default false,
  add column if not exists tax_reserve_pct numeric not null default 0
    check (tax_reserve_pct >= 0 and tax_reserve_pct <= 50),
  add column if not exists round_up_enabled boolean not null default false,
  add column if not exists pay_yourself_first_pct numeric not null default 0
    check (pay_yourself_first_pct >= 0 and pay_yourself_first_pct <= 50);

-- Dynamic financial missions ("Five no-spend days starting now").
create table financial_missions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  created_by uuid not null references profiles (id),
  title text not null,
  description text,
  start_date date not null default current_date,
  end_date date not null,
  status text not null default 'active'
    check (status in ('active', 'kept', 'broken', 'dismissed')),
  created_at timestamptz not null default now()
);

create index financial_missions_wallet_idx on financial_missions (wallet_id, status, end_date desc);

alter table financial_missions enable row level security;

create policy "select if member" on financial_missions
  for select using (is_wallet_member(wallet_id, 'viewer'));
create policy "insert if editor" on financial_missions
  for insert with check (is_wallet_member(wallet_id, 'editor'));
create policy "update if editor" on financial_missions
  for update using (is_wallet_member(wallet_id, 'editor'));
create policy "delete if editor" on financial_missions
  for delete using (is_wallet_member(wallet_id, 'editor'));

-- Split expenses: one split per transaction, shares per wallet member.
create table expense_splits (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  transaction_id uuid not null references transactions (id) on delete cascade,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  unique (transaction_id)
);

create index expense_splits_wallet_idx on expense_splits (wallet_id);

alter table expense_splits enable row level security;

create policy "select if member" on expense_splits
  for select using (is_wallet_member(wallet_id, 'viewer'));
create policy "insert if editor" on expense_splits
  for insert with check (is_wallet_member(wallet_id, 'editor'));
create policy "update if editor" on expense_splits
  for update using (is_wallet_member(wallet_id, 'editor'));
create policy "delete if editor" on expense_splits
  for delete using (is_wallet_member(wallet_id, 'editor'));

create table expense_split_shares (
  id uuid primary key default gen_random_uuid(),
  split_id uuid not null references expense_splits (id) on delete cascade,
  member_user_id uuid not null references profiles (id),
  share_minor bigint not null check (share_minor >= 0),
  settled boolean not null default false,
  unique (split_id, member_user_id)
);

create index expense_split_shares_split_idx on expense_split_shares (split_id);

alter table expense_split_shares enable row level security;

create policy "select if member" on expense_split_shares
  for select using (
    exists (
      select 1 from expense_splits s
      where s.id = split_id and is_wallet_member(s.wallet_id, 'viewer')
    )
  );
create policy "insert if editor" on expense_split_shares
  for insert with check (
    exists (
      select 1 from expense_splits s
      where s.id = split_id and is_wallet_member(s.wallet_id, 'editor')
    )
  );
create policy "update if editor" on expense_split_shares
  for update using (
    exists (
      select 1 from expense_splits s
      where s.id = split_id and is_wallet_member(s.wallet_id, 'editor')
    )
  );
create policy "delete if editor" on expense_split_shares
  for delete using (
    exists (
      select 1 from expense_splits s
      where s.id = split_id and is_wallet_member(s.wallet_id, 'editor')
    )
  );
