-- Advanced companion surfaces: life events, pact stakes, couple mode.

-- Couple as a first-class mode (alongside family).
alter table profiles drop constraint if exists profiles_mode_check;
alter table profiles
  add constraint profiles_mode_check
  check (mode in ('individual', 'family', 'business', 'couple'));

alter table profiles
  add column if not exists life_event jsonb
    default null;
-- shape: { "kind": "travel"|"job_change"|"newborn"|"wedding"|"other", "label": "...", "starts_on": "YYYY-MM-DD", "ends_on": "YYYY-MM-DD"|null }

-- Pact stakes (optional; no payment rails — honor-system / charity pledge).
alter table commitment_pacts
  add column if not exists stake_kind text
    check (stake_kind is null or stake_kind in ('none', 'charity', 'friend')),
  add column if not exists stake_amount_minor bigint
    check (stake_amount_minor is null or stake_amount_minor >= 0),
  add column if not exists stake_note text;

comment on column commitment_pacts.stake_kind is
  'Optional stakes when pact breaks: charity pledge or friend accountability (honor system).';

-- Advisor seat: wallet_members.role viewer already exists; label-only on client.
-- Optional note on invite for coach context.
alter table wallet_members
  add column if not exists seat_label text;
-- e.g. 'advisor' | 'partner' | null (default member)
