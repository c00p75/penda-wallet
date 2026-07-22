-- Onboarding now lets people pick more than one primary financial goal.
-- Add a `primary_goals` array alongside the existing single `primary_goal`
-- column (0029_onboarding_profile_fields.sql). `primary_goal` is kept as the
-- top-priority pick (first in the array) for backward compatibility with the
-- edge functions and the mobile client that still read the single column.
alter table profiles
  add column if not exists primary_goals text[]
    check (
      primary_goals is null
      or primary_goals <@ array[
        'build_emergency_fund', 'pay_off_debt', 'save_for_something', 'track_spending'
      ]::text[]
    );

-- Backfill: seed the array from any existing single goal so returning users
-- keep their onboarding context.
update profiles
  set primary_goals = array[primary_goal]
  where primary_goal is not null
    and primary_goals is null;
