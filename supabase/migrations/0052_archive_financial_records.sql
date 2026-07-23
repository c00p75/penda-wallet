-- Debts, savings goals, and challenges are archived, not deleted, since
-- deleting them cascades to their payment/contribution/participant history.
-- Same pattern as financial_missions (0050_mission_archiving.sql).
alter table debts
  add column if not exists archived_at timestamptz;

alter table savings_goals
  add column if not exists archived_at timestamptz;

alter table budget_challenges
  add column if not exists archived_at timestamptz;

create index if not exists debts_wallet_active_idx
  on debts (wallet_id)
  where archived_at is null;

create index if not exists savings_goals_wallet_active_idx
  on savings_goals (wallet_id)
  where archived_at is null;

create index if not exists budget_challenges_active_idx
  on budget_challenges (wallet_id)
  where archived_at is null;
