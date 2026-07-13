-- Global default categories (wallet_id is null), available to every wallet.
insert into categories (name, icon, color, is_system) values
  ('Food & Drinks', 'utensils', '#f97316', true),
  ('Shopping', 'shopping-bag', '#a855f7', true),
  ('Transportation', 'car', '#3b82f6', true),
  ('Housing', 'home', '#14b8a6', true),
  ('Utilities', 'plug', '#eab308', true),
  ('Entertainment', 'clapperboard', '#ec4899', true),
  ('Health', 'heart-pulse', '#ef4444', true),
  ('Income', 'banknote', '#22c55e', true),
  ('Transfer', 'arrow-left-right', '#64748b', true),
  ('Other', 'ellipsis', '#94a3b8', true)
on conflict do nothing;
