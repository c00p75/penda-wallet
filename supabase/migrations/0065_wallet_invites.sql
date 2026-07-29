-- Real pending-invite flow for shared wallets, replacing the old
-- invite_wallet_member RPC (which only worked if the invitee already had an
-- account and never sent anything). Invites now persist as their own state
-- machine, can target an email with no account yet, auto-link at signup,
-- and get delivered by an Edge Function (email + in-app notification).

-- ---------------------------------------------------------------------------
-- Notifications: add an 'invite' kind for wallet invites.
-- ---------------------------------------------------------------------------
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'notifications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%kind%';
  if v_conname is not null then
    execute format('alter table notifications drop constraint %I', v_conname);
  end if;
end $$;

alter table notifications
  add constraint notifications_kind_check
  check (kind in ('tip', 'reminder', 'insight', 'update', 'alert', 'invite'));

-- ---------------------------------------------------------------------------
-- wallet_invites
-- ---------------------------------------------------------------------------
create table wallet_invites (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  invited_email text not null,
  invited_user_id uuid references profiles (id) on delete set null,
  role text not null check (role in ('editor', 'viewer')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  invited_by uuid not null references profiles (id) on delete cascade,
  email_sent_at timestamptz,
  resend_count int not null default 0,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days')
);

create index wallet_invites_wallet_idx on wallet_invites (wallet_id);
create index wallet_invites_invited_user_idx
  on wallet_invites (invited_user_id)
  where invited_user_id is not null;
create index wallet_invites_pending_email_idx
  on wallet_invites (lower(invited_email))
  where status = 'pending';

-- One active pending invite per wallet+email; re-inviting refreshes it.
create unique index wallet_invites_pending_unique
  on wallet_invites (wallet_id, lower(invited_email))
  where status = 'pending';

alter table wallet_invites enable row level security;

create policy "select as owner or invitee" on wallet_invites for select
  using (
    is_wallet_member(wallet_id, 'owner')
    or invited_user_id = auth.uid()
  );

-- No insert/update/delete policies: all writes go through the
-- security-definer functions below (same pattern as `notifications`).

grant execute on function is_wallet_member(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- create_wallet_invite: owner creates or refreshes a pending invite.
-- ---------------------------------------------------------------------------
create function create_wallet_invite(p_wallet_id uuid, p_email text, p_role text default 'editor')
returns wallet_invites
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(p_email));
  v_my_email text;
  v_invited_user_id uuid;
  v_member_count int;
  v_pending_count int;
  v_invite wallet_invites;
begin
  if not is_wallet_member(p_wallet_id, 'owner') then
    raise exception 'Only the wallet owner can invite members';
  end if;

  if p_role not in ('editor', 'viewer') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;

  select email into v_my_email from auth.users where id = auth.uid();
  if lower(coalesce(v_my_email, '')) = v_email then
    raise exception 'You can''t invite yourself';
  end if;

  select id into v_invited_user_id from auth.users where lower(email) = v_email;

  if v_invited_user_id is not null
     and exists (
       select 1 from wallet_members
       where wallet_id = p_wallet_id and user_id = v_invited_user_id
     )
  then
    raise exception 'This person is already a member. Change their role from the members list instead.';
  end if;

  select count(*) into v_member_count from wallet_members where wallet_id = p_wallet_id;
  -- Pending invites to *other* emails count toward the free-tier seat cap too,
  -- so a free wallet can't dodge the limit by stacking un-accepted invites.
  select count(*) into v_pending_count
  from wallet_invites
  where wallet_id = p_wallet_id
    and status = 'pending'
    and lower(invited_email) <> v_email;

  if (v_member_count + v_pending_count) >= 2 and not is_premium(auth.uid()) then
    raise exception 'PREMIUM_REQUIRED: Free wallets are limited to 2 members. Upgrade to Penda Premium to add more.';
  end if;

  insert into wallet_invites (wallet_id, invited_email, invited_user_id, role, invited_by)
  values (p_wallet_id, trim(p_email), v_invited_user_id, p_role, auth.uid())
  on conflict (wallet_id, lower(invited_email)) where status = 'pending'
  do update set
    role = excluded.role,
    invited_user_id = excluded.invited_user_id,
    invited_by = excluded.invited_by,
    expires_at = now() + interval '14 days',
    responded_at = null
  returning * into v_invite;

  return v_invite;
end;
$$;

grant execute on function create_wallet_invite(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_wallet_invite_delivered: bump delivery bookkeeping after a successful
-- send (called by the wallet-invite-deliver Edge Function as the owner).
-- ---------------------------------------------------------------------------
create function mark_wallet_invite_delivered(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
begin
  select wallet_id into v_wallet_id from wallet_invites where id = p_invite_id;
  if v_wallet_id is null then
    raise exception 'Invite not found';
  end if;

  if not is_wallet_member(v_wallet_id, 'owner') then
    raise exception 'Only the wallet owner can do this';
  end if;

  update wallet_invites
  set
    email_sent_at = now(),
    resend_count = resend_count + 1,
    expires_at = greatest(expires_at, now() + interval '14 days')
  where id = p_invite_id and status = 'pending';
end;
$$;

grant execute on function mark_wallet_invite_delivered(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- revoke_wallet_invite: owner cancels a pending invite.
-- ---------------------------------------------------------------------------
create function revoke_wallet_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite wallet_invites;
begin
  select * into v_invite from wallet_invites where id = p_invite_id for update;
  if not found then
    raise exception 'Invite not found';
  end if;

  if not is_wallet_member(v_invite.wallet_id, 'owner') then
    raise exception 'Only the wallet owner can revoke invites';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'This invite is no longer pending';
  end if;

  update wallet_invites set status = 'revoked', responded_at = now() where id = p_invite_id;
end;
$$;

grant execute on function revoke_wallet_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_wallet_invites: pending invites addressed to the current user,
-- with wallet/inviter names joined in (invitee isn't a wallet member yet, so
-- a plain client-side join would be blocked by `wallets` RLS).
-- ---------------------------------------------------------------------------
create function get_my_wallet_invites()
returns table (
  id uuid,
  wallet_id uuid,
  wallet_name text,
  role text,
  invited_by_name text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
security definer
set search_path = public, auth
stable
as $$
  select
    wi.id,
    wi.wallet_id,
    w.name as wallet_name,
    wi.role,
    coalesce(p.display_name, 'A Penda user') as invited_by_name,
    wi.created_at,
    wi.expires_at
  from wallet_invites wi
  join wallets w on w.id = wi.wallet_id
  left join profiles p on p.id = wi.invited_by
  where wi.status = 'pending'
    and wi.expires_at > now()
    and (
      wi.invited_user_id = auth.uid()
      or (
        wi.invited_user_id is null
        and lower(wi.invited_email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
      )
    )
  order by wi.created_at desc;
$$;

grant execute on function get_my_wallet_invites() to authenticated;

-- ---------------------------------------------------------------------------
-- accept_wallet_invite / decline_wallet_invite
-- ---------------------------------------------------------------------------
create function accept_wallet_invite(p_invite_id uuid)
returns wallet_members
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite wallet_invites;
  v_my_email text;
  v_member wallet_members;
  v_member_count int;
begin
  select * into v_invite from wallet_invites where id = p_invite_id for update;
  if not found then
    raise exception 'Invite not found';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'This invite is no longer valid.';
  end if;

  if v_invite.expires_at < now() then
    raise exception 'This invite has expired. Ask the wallet owner to send a new one.';
  end if;

  select email into v_my_email from auth.users where id = auth.uid();

  if v_invite.invited_user_id is not null then
    if v_invite.invited_user_id <> auth.uid() then
      raise exception 'This invite was sent to a different account.';
    end if;
  elsif lower(v_invite.invited_email) <> lower(coalesce(v_my_email, '')) then
    raise exception 'This invite was sent to a different email address.';
  end if;

  -- Re-check the seat cap at accept time too: the owner's plan may have
  -- changed (or lapsed) since the invite was sent.
  select count(*) into v_member_count from wallet_members where wallet_id = v_invite.wallet_id;
  if v_member_count >= 2 and not is_premium(v_invite.invited_by) then
    raise exception 'PREMIUM_REQUIRED: The wallet owner needs Penda Premium to add more members.';
  end if;

  insert into wallet_members (wallet_id, user_id, role)
  values (v_invite.wallet_id, auth.uid(), v_invite.role)
  on conflict (wallet_id, user_id) do update set role = excluded.role
  returning * into v_member;

  update wallet_invites
  set status = 'accepted', responded_at = now(), invited_user_id = auth.uid()
  where id = p_invite_id;

  insert into notifications (user_id, wallet_id, kind, title, body, href, dedupe_key)
  values (
    v_invite.invited_by,
    v_invite.wallet_id,
    'update',
    'Invite accepted',
    coalesce(v_my_email, 'Someone') || ' joined your money account.',
    '/profile',
    'wallet-invite-accepted:' || p_invite_id::text
  )
  on conflict (user_id, dedupe_key) do nothing;

  return v_member;
end;
$$;

grant execute on function accept_wallet_invite(uuid) to authenticated;

create function decline_wallet_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_invite wallet_invites;
  v_my_email text;
begin
  select * into v_invite from wallet_invites where id = p_invite_id for update;
  if not found then
    raise exception 'Invite not found';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'This invite is no longer valid.';
  end if;

  select email into v_my_email from auth.users where id = auth.uid();

  if v_invite.invited_user_id is not null then
    if v_invite.invited_user_id <> auth.uid() then
      raise exception 'This invite was sent to a different account.';
    end if;
  elsif lower(v_invite.invited_email) <> lower(coalesce(v_my_email, '')) then
    raise exception 'This invite was sent to a different email address.';
  end if;

  update wallet_invites set status = 'declined', responded_at = now() where id = p_invite_id;

  insert into notifications (user_id, wallet_id, kind, title, body, href, dedupe_key)
  values (
    v_invite.invited_by,
    v_invite.wallet_id,
    'update',
    'Invite declined',
    coalesce(v_my_email, 'Someone') || ' declined your invite.',
    '/profile',
    'wallet-invite-declined:' || p_invite_id::text
  )
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

grant execute on function decline_wallet_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Auto-link pending invites when the invited email finally signs up, and
-- notify them in-app immediately (there's no existing account to notify
-- before this point).
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
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

  update public.wallet_invites
  set invited_user_id = new.id
  where invited_user_id is null
    and status = 'pending'
    and expires_at > now()
    and lower(invited_email) = lower(new.email);

  insert into public.notifications (user_id, wallet_id, kind, title, body, href, dedupe_key)
  select
    new.id,
    wi.wallet_id,
    'invite',
    'You were invited to ' || w.name,
    coalesce(p.display_name, 'A Penda user') || ' invited you to help manage ' || w.name || '.',
    '/invites',
    'wallet-invite:' || wi.id::text
  from public.wallet_invites wi
  join public.wallets w on w.id = wi.wallet_id
  left join public.profiles p on p.id = wi.invited_by
  where wi.invited_user_id = new.id
    and wi.status = 'pending'
  on conflict (user_id, dedupe_key) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily sweep: flip stale pending invites to 'expired' (pure SQL, no HTTP).
-- ---------------------------------------------------------------------------
select
  cron.schedule(
    'expire-wallet-invites',
    '0 3 * * *',
    $$
    update wallet_invites
    set status = 'expired', responded_at = now()
    where status = 'pending' and expires_at < now();
    $$
  );

-- ---------------------------------------------------------------------------
-- Superseded by the invite flow above: silently added members with no
-- pending state, no email, and a hard error for anyone without an account.
-- ---------------------------------------------------------------------------
drop function if exists invite_wallet_member(uuid, text, text);
