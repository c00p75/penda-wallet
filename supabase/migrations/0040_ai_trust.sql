-- Graduated AI trust: counters for confirmed/undone actions and auto-loose flag.
-- When confirmed_ok >= 10 and confirmed_undone = 0, chat may auto-apply updates/deletes.

alter table profiles
  add column if not exists ai_trust jsonb not null
    default '{"confirmed_ok":0,"confirmed_undone":0,"auto_loose":false}'::jsonb;

-- Auto-applied actions land as confirmed for audit; optional status for clarity.
alter table ai_pending_actions
  drop constraint if exists ai_pending_actions_status_check;

alter table ai_pending_actions
  add constraint ai_pending_actions_status_check
  check (status in ('pending', 'confirmed', 'cancelled', 'auto_applied'));
