-- Debt payments can now be tied to the pocket they were paid from/into, and
-- get a linked transaction (so the pocket's balance actually reflects the
-- payment) filed under a dedicated system category.

alter table debt_payments
  add column account_id uuid references accounts (id) on delete set null;

insert into categories (name, icon, color, is_system)
select 'Debt payment', '💳', '#e11d48', true
where not exists (
  select 1
  from categories
  where wallet_id is null
    and is_system
    and name = 'Debt payment'
);
