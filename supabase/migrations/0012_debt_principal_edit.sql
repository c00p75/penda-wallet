-- Editing an existing debt's principal must re-derive balance_minor from
-- payments-to-date, or it would drift from the principal - sum(payments)
-- invariant that sync_debt_balance() otherwise maintains.

create or replace function recompute_debt_balance_on_principal_change()
returns trigger
security definer set search_path = public
language plpgsql
as $$
begin
  if new.principal_minor is distinct from old.principal_minor then
    new.balance_minor := new.principal_minor - (
      select coalesce(sum(amount_minor), 0) from debt_payments where debt_id = new.id
    );
  end if;
  return new;
end;
$$;

create trigger before_debt_principal_change
  before update on debts
  for each row execute function recompute_debt_balance_on_principal_change();
