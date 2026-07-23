-- Missions are archived, not deleted, once resolved (kept/broken), so the
-- history stays intact; the mission list just filters archived rows out.
alter table financial_missions
  add column if not exists archived_at timestamptz;

create index if not exists financial_missions_wallet_active_idx
  on financial_missions (wallet_id, end_date desc)
  where archived_at is null;
