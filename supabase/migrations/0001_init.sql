-- Penda initial schema: wallets, transactions, budgets, goals, debts,
-- challenges, chat, insights, and row-level security for shared wallets.
-- All monetary columns are bigint minor-units (cents) — never floats.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  default_currency text not null default 'USD',
  ai_personality text not null default 'balanced_coach',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "select own profile" on profiles for select using (id = auth.uid());
create policy "update own profile" on profiles for update using (id = auth.uid());
create policy "insert own profile" on profiles for insert with check (id = auth.uid());

-- Auto-create a profile row whenever a new auth user signs up.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Wallets & membership
-- ---------------------------------------------------------------------------

create table wallets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_shared boolean not null default false,
  base_currency text not null default 'USD',
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table wallet_members (
  wallet_id uuid not null references wallets (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (wallet_id, user_id)
);

-- Central RLS helper: avoids recursive policies and repeated subqueries
-- across every wallet-scoped table.
create function is_wallet_member(p_wallet_id uuid, p_min_role text default 'viewer')
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from wallet_members
    where wallet_id = p_wallet_id
      and user_id = auth.uid()
      and (
        p_min_role = 'viewer'
        or (p_min_role = 'editor' and role in ('editor', 'owner'))
        or (p_min_role = 'owner' and role = 'owner')
      )
  );
$$;

alter table wallets enable row level security;
alter table wallet_members enable row level security;

create policy "select if member" on wallets for select using (is_wallet_member(id, 'viewer'));
create policy "insert own wallet" on wallets for insert with check (created_by = auth.uid());
create policy "update if owner" on wallets for update using (is_wallet_member(id, 'owner'));
create policy "delete if owner" on wallets for delete using (is_wallet_member(id, 'owner'));

create policy "select own membership rows" on wallet_members for select using (
  user_id = auth.uid() or is_wallet_member(wallet_id, 'viewer')
);
create policy "owner manages membership insert" on wallet_members for insert with check (
  is_wallet_member(wallet_id, 'owner')
  -- allow the creating user to add themself as the first owner
  or (user_id = auth.uid() and not exists (select 1 from wallet_members where wallet_id = wallet_members.wallet_id))
);
create policy "owner manages membership update" on wallet_members for update using (is_wallet_member(wallet_id, 'owner'));
create policy "owner manages membership delete" on wallet_members for delete using (is_wallet_member(wallet_id, 'owner'));

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

create table categories (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references wallets (id) on delete cascade, -- null = global default category
  name text not null,
  icon text,
  color text,
  parent_category_id uuid references categories (id) on delete set null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

alter table categories enable row level security;

create policy "select global or member categories" on categories for select using (
  wallet_id is null or is_wallet_member(wallet_id, 'viewer')
);
create policy "insert member categories" on categories for insert with check (
  wallet_id is not null and is_wallet_member(wallet_id, 'editor')
);
create policy "update member categories" on categories for update using (
  wallet_id is not null and is_wallet_member(wallet_id, 'editor')
);
create policy "delete member categories" on categories for delete using (
  wallet_id is not null and is_wallet_member(wallet_id, 'owner')
);

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------

create table transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  created_by uuid not null references profiles (id),
  category_id uuid references categories (id) on delete set null,
  amount_minor bigint not null,
  currency text not null,
  fx_rate_to_wallet_base numeric,
  converted_amount_minor bigint,
  type text not null check (type in ('expense', 'income', 'transfer')),
  merchant text,
  description text,
  transaction_date date not null default current_date,
  source text not null check (source in ('manual', 'chat', 'voice', 'receipt')),
  receipt_storage_path text,
  ai_extraction jsonb,
  ai_category_confidence numeric,
  user_confirmed boolean not null default true,
  version integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_wallet_date_idx on transactions (wallet_id, transaction_date desc) where deleted_at is null;

create table transaction_line_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions (id) on delete cascade,
  description text,
  amount_minor bigint not null,
  quantity numeric not null default 1
);

alter table transactions enable row level security;
alter table transaction_line_items enable row level security;

create policy "select if member" on transactions for select using (is_wallet_member(wallet_id, 'viewer'));
create policy "insert if editor" on transactions for insert with check (is_wallet_member(wallet_id, 'editor'));
create policy "update if editor" on transactions for update using (is_wallet_member(wallet_id, 'editor'));
create policy "delete if owner" on transactions for delete using (is_wallet_member(wallet_id, 'owner'));

create policy "select line items if member" on transaction_line_items for select using (
  exists (select 1 from transactions t where t.id = transaction_id and is_wallet_member(t.wallet_id, 'viewer'))
);
create policy "write line items if editor" on transaction_line_items for all using (
  exists (select 1 from transactions t where t.id = transaction_id and is_wallet_member(t.wallet_id, 'editor'))
);

-- ---------------------------------------------------------------------------
-- Budgets & recurring transactions
-- ---------------------------------------------------------------------------

create table budgets (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  category_id uuid references categories (id) on delete cascade,
  amount_minor bigint not null,
  period text not null check (period in ('weekly', 'monthly')),
  rollover boolean not null default false,
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  template jsonb not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  next_run_date date not null,
  last_run_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table budgets enable row level security;
alter table recurring_transactions enable row level security;

create policy "select if member" on budgets for select using (is_wallet_member(wallet_id, 'viewer'));
create policy "write if editor" on budgets for insert with check (is_wallet_member(wallet_id, 'editor'));
create policy "update if editor" on budgets for update using (is_wallet_member(wallet_id, 'editor'));
create policy "delete if owner" on budgets for delete using (is_wallet_member(wallet_id, 'owner'));

create policy "select if member" on recurring_transactions for select using (is_wallet_member(wallet_id, 'viewer'));
create policy "write if editor" on recurring_transactions for insert with check (is_wallet_member(wallet_id, 'editor'));
create policy "update if editor" on recurring_transactions for update using (is_wallet_member(wallet_id, 'editor'));
create policy "delete if owner" on recurring_transactions for delete using (is_wallet_member(wallet_id, 'owner'));

-- ---------------------------------------------------------------------------
-- Savings goals & debt tracking
-- ---------------------------------------------------------------------------

create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  name text not null,
  icon text,
  target_amount_minor bigint not null,
  current_amount_minor bigint not null default 0,
  target_date date,
  created_at timestamptz not null default now()
);

create table debts (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  name text not null,
  direction text not null check (direction in ('owed_to_me', 'i_owe')),
  counterparty text,
  principal_minor bigint not null,
  balance_minor bigint not null,
  interest_rate numeric,
  due_date date,
  created_at timestamptz not null default now()
);

create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts (id) on delete cascade,
  amount_minor bigint not null,
  paid_date date not null default current_date
);

alter table savings_goals enable row level security;
alter table debts enable row level security;
alter table debt_payments enable row level security;

create policy "select if member" on savings_goals for select using (is_wallet_member(wallet_id, 'viewer'));
create policy "write if editor" on savings_goals for insert with check (is_wallet_member(wallet_id, 'editor'));
create policy "update if editor" on savings_goals for update using (is_wallet_member(wallet_id, 'editor'));
create policy "delete if owner" on savings_goals for delete using (is_wallet_member(wallet_id, 'owner'));

create policy "select if member" on debts for select using (is_wallet_member(wallet_id, 'viewer'));
create policy "write if editor" on debts for insert with check (is_wallet_member(wallet_id, 'editor'));
create policy "update if editor" on debts for update using (is_wallet_member(wallet_id, 'editor'));
create policy "delete if owner" on debts for delete using (is_wallet_member(wallet_id, 'owner'));

create policy "select debt payments if member" on debt_payments for select using (
  exists (select 1 from debts d where d.id = debt_id and is_wallet_member(d.wallet_id, 'viewer'))
);
create policy "write debt payments if editor" on debt_payments for all using (
  exists (select 1 from debts d where d.id = debt_id and is_wallet_member(d.wallet_id, 'editor'))
);

-- ---------------------------------------------------------------------------
-- Budget challenges (social)
-- ---------------------------------------------------------------------------

create table budget_challenges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  creator_id uuid not null references profiles (id),
  type text not null check (type in ('savings_target', 'spending_limit', 'no_spend_streak')),
  target_metric jsonb not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

create table challenge_participants (
  challenge_id uuid not null references budget_challenges (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

alter table budget_challenges enable row level security;
alter table challenge_participants enable row level security;

create policy "select challenges you created or joined" on budget_challenges for select using (
  creator_id = auth.uid()
  or exists (select 1 from challenge_participants cp where cp.challenge_id = id and cp.user_id = auth.uid())
);
create policy "create own challenges" on budget_challenges for insert with check (creator_id = auth.uid());
create policy "creator updates challenge" on budget_challenges for update using (creator_id = auth.uid());
create policy "creator deletes challenge" on budget_challenges for delete using (creator_id = auth.uid());

create policy "select participants of visible challenges" on challenge_participants for select using (
  user_id = auth.uid()
  or exists (select 1 from budget_challenges bc where bc.id = challenge_id and bc.creator_id = auth.uid())
);
create policy "join challenge as self" on challenge_participants for insert with check (user_id = auth.uid());
create policy "update own participation" on challenge_participants for update using (user_id = auth.uid());
create policy "leave challenge" on challenge_participants for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Chat (private per-user even inside shared wallets)
-- ---------------------------------------------------------------------------

create table chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  wallet_id uuid not null references wallets (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content jsonb not null,
  created_at timestamptz not null default now()
);

alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

create policy "select own conversations" on chat_conversations for select using (user_id = auth.uid());
create policy "insert own conversations" on chat_conversations for insert with check (user_id = auth.uid());
create policy "delete own conversations" on chat_conversations for delete using (user_id = auth.uid());

create policy "select own messages" on chat_messages for select using (
  exists (select 1 from chat_conversations c where c.id = conversation_id and c.user_id = auth.uid())
);
create policy "insert own messages" on chat_messages for insert with check (
  exists (select 1 from chat_conversations c where c.id = conversation_id and c.user_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- AI insights & user-owned categorization rules
-- ---------------------------------------------------------------------------

create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  type text not null check (type in ('weekly_digest', 'anomaly', 'recommendation', 'goal_forecast')),
  content jsonb not null,
  period_start date,
  period_end date,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

-- User-owned overrides that outrank AI categorization going forward — the
-- "transparent, correctable categorization" differentiator vs. black-box AI.
create table categorization_rules (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  match_type text not null check (match_type in ('merchant_contains', 'description_contains')),
  match_value text not null,
  category_id uuid not null references categories (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table ai_insights enable row level security;
alter table categorization_rules enable row level security;

create policy "select own insights" on ai_insights for select using (user_id = auth.uid());
create policy "dismiss own insights" on ai_insights for update using (user_id = auth.uid());

create policy "select if member" on categorization_rules for select using (is_wallet_member(wallet_id, 'viewer'));
create policy "write if editor" on categorization_rules for insert with check (is_wallet_member(wallet_id, 'editor'));
create policy "update if editor" on categorization_rules for update using (is_wallet_member(wallet_id, 'editor'));
create policy "delete if editor" on categorization_rules for delete using (is_wallet_member(wallet_id, 'editor'));

-- ---------------------------------------------------------------------------
-- Push, entitlements, exchange rates
-- ---------------------------------------------------------------------------

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create table entitlements (
  user_id uuid primary key references profiles (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  status text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz
);

create table exchange_rates (
  base_currency text not null,
  quote_currency text not null,
  rate numeric not null,
  fetched_at timestamptz not null default now(),
  primary key (base_currency, quote_currency)
);

alter table push_subscriptions enable row level security;
alter table entitlements enable row level security;
alter table exchange_rates enable row level security;

create policy "manage own push subscriptions" on push_subscriptions for all using (user_id = auth.uid());
create policy "select own entitlement" on entitlements for select using (user_id = auth.uid());
create policy "select exchange rates" on exchange_rates for select using (true);

-- entitlements defaults to 'free' for every new user; writes happen only via
-- the service-role key from a future stripe-webhook Edge Function.
create function handle_new_profile_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.entitlements (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_profile_created
  after insert on profiles
  for each row execute function handle_new_profile_entitlement();
