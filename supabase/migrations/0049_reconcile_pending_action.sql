-- set_balance now stages a confirmation card instead of applying immediately
-- (roadmap bet #4 gap): it needs its own pending-action kind since it doesn't
-- patch an existing row, it computes a delta and creates an adjustment
-- transaction at confirm time. See executePendingAction.ts's 'reconcile' branch.
alter table ai_pending_actions
  drop constraint if exists ai_pending_actions_kind_check;

alter table ai_pending_actions
  add constraint ai_pending_actions_kind_check
  check (kind in ('update', 'delete', 'reconcile'));
