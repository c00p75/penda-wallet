-- A pact can optionally serve a specific savings goal ("Caffeine Cap" in aid
-- of "Paris 2025") instead of just restricting a category wallet-wide, so the
-- goal detail screen can surface the pacts committed in its service.
alter table commitment_pacts add column goal_id uuid references savings_goals (id) on delete cascade;

create index commitment_pacts_goal_idx on commitment_pacts (goal_id) where goal_id is not null;
