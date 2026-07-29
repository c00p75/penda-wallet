-- Per-user home screen card layout: custom order and custom colors for the
-- pocket/summary card carousel. Pockets already have their own `color` and
-- `sort_order` (see 0056); this covers the cards that have no table row of
-- their own (Total balance, Safe to spend, Goal, This month) plus the
-- combined ordering across both.
alter table profiles
  add column if not exists home_card_order jsonb not null default '[]'::jsonb,
  add column if not exists home_card_colors jsonb not null default '{}'::jsonb;
