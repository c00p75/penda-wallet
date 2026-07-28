-- Allow staging creates on ai_pending_actions so chat can ask Yes/Cancel
-- before inserting budgets, goals, debts, recurring rules, and pacts.
-- (Transaction logging and create_category stay immediate for chainability.)

alter table ai_pending_actions
  drop constraint if exists ai_pending_actions_kind_check;

alter table ai_pending_actions
  add constraint ai_pending_actions_kind_check
  check (kind in ('create', 'update', 'delete', 'reconcile'));
