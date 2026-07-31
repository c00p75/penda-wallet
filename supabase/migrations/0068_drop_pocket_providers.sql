-- Provider (a bank/mobile-money-operator name, separate from Type) turned out
-- to do no real product work: optional everywhere, not exposed to the AI's
-- create_pocket tool, and its only behavior was a narrow fuzzy-match fallback
-- in SMS-paste account matching and chat account-name resolution (both kept
-- working via Type/name matching alone). Dropping it simplifies pocket
-- creation to just Type. Confirmed zero rows in account_providers and zero
-- accounts referencing provider_id before writing this migration.

alter table accounts drop column if exists provider_id;

drop table if exists account_providers;

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

  insert into accounts (wallet_id, name, kind_id, icon, sort_order, is_default)
  values (v_wallet.id, 'Cash', v_cash_kind_id, '💵', 0, true);

  return v_wallet;
end;
$$;

grant execute on function create_wallet_with_owner(text, text) to authenticated;
