-- Dream Builder (bet 11): capture *why* a goal matters so the AI can connect
-- it to outcomes and keep the user motivated, not just track a number.
alter table savings_goals add column if not exists motivation text;
