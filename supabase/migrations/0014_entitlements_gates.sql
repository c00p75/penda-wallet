-- Server-side entitlement enforcement. Client-side gating (Phase 10's
-- paywall UI) is UX-only — the real gate is here, so it can't be bypassed
-- by calling the API directly.

create or replace function is_premium(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select plan = 'premium' from entitlements where user_id = p_user_id), false);
$$;

grant execute on function is_premium(uuid) to authenticated;

-- Free wallets are capped at 2 members (owner + 1). Errors raised here are
-- prefixed "PREMIUM_REQUIRED:" so the client can show a paywall sheet
-- instead of a generic error toast.
create or replace function invite_wallet_member(p_wallet_id uuid, p_email text, p_role text default 'editor')
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_member_count int;
begin
  if not is_wallet_member(p_wallet_id, 'owner') then
    raise exception 'Only the wallet owner can invite members';
  end if;

  if p_role not in ('owner', 'editor', 'viewer') then
    raise exception 'Invalid role: %', p_role;
  end if;

  select id into v_user_id from auth.users where email = p_email;
  if v_user_id is null then
    raise exception 'No Penda account found for that email';
  end if;

  select count(*) into v_member_count from wallet_members where wallet_id = p_wallet_id;
  if v_member_count >= 2 and not is_premium(auth.uid()) then
    raise exception 'PREMIUM_REQUIRED: Free wallets are limited to 2 members. Upgrade to Penda Premium to add more.';
  end if;

  insert into wallet_members (wallet_id, user_id, role)
  values (p_wallet_id, v_user_id, p_role)
  on conflict (wallet_id, user_id) do update set role = excluded.role;
end;
$$;
