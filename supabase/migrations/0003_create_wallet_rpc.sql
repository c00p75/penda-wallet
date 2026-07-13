-- Wallet + first-owner membership must be created atomically: inserting the
-- wallet row alone fails PostgREST's RETURNING (which is filtered by the
-- table's SELECT policy) because is_wallet_member() has no membership row
-- yet. security definer bypasses RLS for both inserts in one transaction.
create function create_wallet_with_owner(p_name text, p_base_currency text default 'USD')
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

  return v_wallet;
end;
$$;

grant execute on function create_wallet_with_owner(text, text) to authenticated;
