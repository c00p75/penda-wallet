-- Dedicated default category for transfer fees / charges (mobile money and
-- bank fees on sends, withdrawals, etc.) so users have a proper place to file
-- them instead of "Other".

insert into categories (name, icon, color, is_system)
select 'Transfer charges', '🧾', '#0891b2', true
where not exists (
  select 1
  from categories
  where wallet_id is null
    and is_system
    and name = 'Transfer charges'
);
