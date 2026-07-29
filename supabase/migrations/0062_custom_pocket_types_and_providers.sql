-- Pockets currently pin "Type" and "Provider" to a fixed CHECK-constrained
-- list (cash/mobile_money/bank/other, airtel/mtn/zamtel/zanaco/other), which
-- locks the app to Zambian mobile money brands. Replace both with per-wallet
-- user-managed lists (add/edit/delete), mirroring the existing `categories`
-- pattern (wallet-scoped rows, RLS by wallet role).

-- ---------------------------------------------------------------------------
-- Pocket types & providers: wallet-owned, fully editable/deletable lists.
-- ---------------------------------------------------------------------------
create table if not exists account_kinds (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  name text not null,
  icon text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists account_providers (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  name text not null,
  icon text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists account_kinds_wallet_idx on account_kinds (wallet_id);
create index if not exists account_providers_wallet_idx on account_providers (wallet_id);

alter table account_kinds enable row level security;
alter table account_providers enable row level security;

create policy "select if member" on account_kinds for select
  using (is_wallet_member(wallet_id, 'viewer'));
create policy "insert if editor" on account_kinds for insert
  with check (is_wallet_member(wallet_id, 'editor'));
create policy "update if editor" on account_kinds for update
  using (is_wallet_member(wallet_id, 'editor'));
create policy "delete if owner" on account_kinds for delete
  using (is_wallet_member(wallet_id, 'owner'));

create policy "select if member" on account_providers for select
  using (is_wallet_member(wallet_id, 'viewer'));
create policy "insert if editor" on account_providers for insert
  with check (is_wallet_member(wallet_id, 'editor'));
create policy "update if editor" on account_providers for update
  using (is_wallet_member(wallet_id, 'editor'));
create policy "delete if owner" on account_providers for delete
  using (is_wallet_member(wallet_id, 'owner'));

-- ---------------------------------------------------------------------------
-- accounts: swap the fixed `kind`/`provider` text columns for FKs.
-- ---------------------------------------------------------------------------
alter table accounts
  add column if not exists kind_id uuid references account_kinds (id) on delete set null,
  add column if not exists provider_id uuid references account_providers (id) on delete set null;

-- Seed the 4 generic starter types for every existing wallet (not brands,
-- just buckets — still fully renameable/deletable by the user).
insert into account_kinds (wallet_id, name, icon, sort_order)
select w.id, v.name, v.icon, v.sort_order
from wallets w
cross join (
  values
    ('Cash', '💵', 0),
    ('Mobile money', '📱', 1),
    ('Bank', '🏦', 2),
    ('Other', '💳', 3)
) as v(name, icon, sort_order);

update accounts a
set kind_id = k.id
from account_kinds k
where k.wallet_id = a.wallet_id
  and k.name = (
    case a.kind
      when 'cash' then 'Cash'
      when 'mobile_money' then 'Mobile money'
      when 'bank' then 'Bank'
      else 'Other'
    end
  );

-- Only backfill providers actually referenced by a wallet's existing pockets —
-- wallets that never used mobile money/bank pockets get zero provider rows.
insert into account_providers (wallet_id, name, icon, sort_order)
select distinct a.wallet_id,
  case a.provider
    when 'airtel' then 'Airtel Money'
    when 'mtn' then 'MTN MoMo'
    when 'zamtel' then 'Zamtel Kwacha'
    when 'zanaco' then 'Zanaco'
    else 'Other'
  end,
  case a.provider
    when 'zanaco' then '🏦'
    else '📱'
  end,
  0
from accounts a
where a.provider is not null;

update accounts a
set provider_id = p.id
from account_providers p
where p.wallet_id = a.wallet_id
  and a.provider is not null
  and p.name = (
    case a.provider
      when 'airtel' then 'Airtel Money'
      when 'mtn' then 'MTN MoMo'
      when 'zamtel' then 'Zamtel Kwacha'
      when 'zanaco' then 'Zanaco'
      else 'Other'
    end
  );

alter table accounts
  drop column kind,
  drop column provider;

-- ---------------------------------------------------------------------------
-- create_wallet_with_owner: seed starter types, point the default Cash
-- pocket at the new Cash kind row.
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
  v_cash_kind_id uuid;
begin
  insert into wallets (name, base_currency, created_by)
  values (p_name, p_base_currency, auth.uid())
  returning * into v_wallet;

  insert into wallet_members (wallet_id, user_id, role)
  values (v_wallet.id, auth.uid(), 'owner');

  insert into account_kinds (wallet_id, name, icon, sort_order)
  values
    (v_wallet.id, 'Cash', '💵', 0),
    (v_wallet.id, 'Mobile money', '📱', 1),
    (v_wallet.id, 'Bank', '🏦', 2),
    (v_wallet.id, 'Other', '💳', 3);

  select id into v_cash_kind_id
  from account_kinds
  where wallet_id = v_wallet.id and name = 'Cash';

  insert into accounts (wallet_id, name, kind_id, provider_id, icon, sort_order, is_default)
  values (v_wallet.id, 'Cash', v_cash_kind_id, null, '💵', 0, true);

  return v_wallet;
end;
$$;

grant execute on function create_wallet_with_owner(text, text) to authenticated;
