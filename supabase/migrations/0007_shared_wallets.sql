-- Allow any member to remove themselves ("leave wallet"); owners can already
-- remove anyone via the existing "owner manages membership delete" policy —
-- Postgres RLS policies on the same command are OR'd together.
create policy "members can leave" on wallet_members for delete using (user_id = auth.uid());

-- Marks a wallet as shared once it has more than one member. A trigger (not a
-- manually-called function) keeps this correct across every path a
-- membership row can change — invite, leave, and owner-removal alike.
create function sync_wallet_is_shared()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid := coalesce(new.wallet_id, old.wallet_id);
begin
  update wallets
  set is_shared = (select count(*) > 1 from wallet_members where wallet_id = v_wallet_id)
  where id = v_wallet_id;
  return null;
end;
$$;

create trigger on_wallet_membership_change
  after insert or delete on wallet_members
  for each row execute function sync_wallet_is_shared();

create function invite_wallet_member(p_wallet_id uuid, p_email text, p_role text default 'editor')
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
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

  insert into wallet_members (wallet_id, user_id, role)
  values (p_wallet_id, v_user_id, p_role)
  on conflict (wallet_id, user_id) do update set role = excluded.role;
end;
$$;

grant execute on function invite_wallet_member(uuid, text, text) to authenticated;

-- Member list with email — auth.users isn't otherwise selectable by clients.
create or replace function get_wallet_members(p_wallet_id uuid)
returns table (user_id uuid, email text, display_name text, role text, joined_at timestamptz)
language sql
security definer
set search_path = public, auth
as $$
  select wm.user_id, u.email::text, p.display_name, wm.role, wm.joined_at
  from wallet_members wm
  join auth.users u on u.id = wm.user_id
  left join profiles p on p.id = wm.user_id
  where wm.wallet_id = p_wallet_id and is_wallet_member(p_wallet_id, 'viewer')
  order by wm.joined_at;
$$;

grant execute on function get_wallet_members(uuid) to authenticated;
