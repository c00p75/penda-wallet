-- Money accounts = existing `wallets` rows (ledger / shared space).
-- Pockets ("wallets" in product UI) = new `accounts` rows under a money account
-- (Cash, Airtel Money, MTN, Zanaco, …).
-- Onboarding completion is user-anchored via profiles.onboarding_completed_at.

-- ---------------------------------------------------------------------------
-- Profile: first-run onboarding completed (not per-pocket).
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists onboarding_completed_at timestamptz;

-- Existing users who already have a money account are treated as onboarded.
update profiles p
set onboarding_completed_at = coalesce(
  (
    select min(w.created_at)
    from wallets w
    join wallet_members wm on wm.wallet_id = w.id
    where wm.user_id = p.id
  ),
  now()
)
where p.onboarding_completed_at is null
  and exists (
    select 1 from wallet_members wm where wm.user_id = p.id
  );

-- ---------------------------------------------------------------------------
-- Pockets (accounts) under a money account (wallet).
-- ---------------------------------------------------------------------------
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  name text not null,
  kind text not null default 'cash'
    check (kind in ('cash', 'mobile_money', 'bank', 'other')),
  provider text
    check (
      provider is null
      or provider in ('airtel', 'mtn', 'zamtel', 'zanaco', 'other')
    ),
  icon text,
  color text,
  sort_order int not null default 0,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_wallet_idx
  on accounts (wallet_id)
  where archived_at is null;

-- At most one default pocket per money account (among non-archived).
create unique index if not exists accounts_one_default_per_wallet
  on accounts (wallet_id)
  where is_default and archived_at is null;

alter table accounts enable row level security;

create policy "select if member" on accounts for select
  using (is_wallet_member(wallet_id, 'viewer'));
create policy "insert if editor" on accounts for insert
  with check (is_wallet_member(wallet_id, 'editor'));
create policy "update if editor" on accounts for update
  using (is_wallet_member(wallet_id, 'editor'));
create policy "delete if owner" on accounts for delete
  using (is_wallet_member(wallet_id, 'owner'));

-- ---------------------------------------------------------------------------
-- Transactions: pocket + transfer pairing
-- ---------------------------------------------------------------------------
alter table transactions
  add column if not exists account_id uuid references accounts (id) on delete set null;

alter table transactions
  add column if not exists transfer_group_id uuid;

create index if not exists transactions_account_date_idx
  on transactions (account_id, transaction_date desc)
  where deleted_at is null and account_id is not null;

create index if not exists transactions_transfer_group_idx
  on transactions (transfer_group_id)
  where transfer_group_id is not null;

-- ---------------------------------------------------------------------------
-- Backfill: one default Cash pocket per money account; attach legacy txs.
-- ---------------------------------------------------------------------------
insert into accounts (wallet_id, name, kind, provider, icon, sort_order, is_default)
select w.id, 'Cash', 'cash', null, '💵', 0, true
from wallets w
where not exists (
  select 1 from accounts a where a.wallet_id = w.id and a.is_default
);

update transactions t
set account_id = a.id
from accounts a
where a.wallet_id = t.wallet_id
  and a.is_default
  and t.account_id is null;

-- ---------------------------------------------------------------------------
-- create_wallet_with_owner: also seed default Cash pocket.
-- ---------------------------------------------------------------------------
create or replace function create_wallet_with_owner(
  p_name text,
  p_base_currency text default 'USD'
)
returns wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet wallets;
begin
  insert into wallets (name, base_currency, created_by)
  values (p_name, p_base_currency, auth.uid())
  returning * into v_wallet;

  insert into wallet_members (wallet_id, user_id, role)
  values (v_wallet.id, auth.uid(), 'owner');

  insert into accounts (wallet_id, name, kind, provider, icon, sort_order, is_default)
  values (v_wallet.id, 'Cash', 'cash', null, '💵', 0, true);

  return v_wallet;
end;
$$;

grant execute on function create_wallet_with_owner(text, text) to authenticated;

-- Helper: resolve default pocket for a money account (for chat / clients).
create or replace function default_account_id(p_wallet_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from accounts
  where wallet_id = p_wallet_id
    and archived_at is null
    and is_default
  limit 1;
$$;

grant execute on function default_account_id(uuid) to authenticated;
