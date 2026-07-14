-- Categories can now be deleted from the client. recurring_transactions
-- stores category_id inside a jsonb template (no FK), so a deleted category
-- would otherwise leave a dangling id that fails the transactions insert's
-- FK constraint the next time the rule fires. Resolve defensively instead.
create or replace function materialize_recurring_transactions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_next_date date;
begin
  for rec in
    select * from recurring_transactions
    where is_active and next_run_date <= current_date
  loop
    insert into transactions (
      wallet_id, created_by, category_id, amount_minor, currency,
      type, merchant, description, transaction_date, source, user_confirmed
    ) values (
      rec.wallet_id,
      rec.created_by,
      (select c.id from categories c where c.id = nullif(rec.template->>'category_id', '')::uuid),
      (rec.template->>'amount_minor')::bigint,
      coalesce(rec.template->>'currency', 'USD'),
      coalesce(rec.template->>'type', 'expense'),
      rec.template->>'merchant',
      rec.template->>'description',
      rec.next_run_date,
      'recurring',
      true
    );

    v_next_date := case rec.frequency
      when 'daily' then rec.next_run_date + 1
      when 'weekly' then rec.next_run_date + 7
      when 'monthly' then (rec.next_run_date + interval '1 month')::date
      when 'yearly' then (rec.next_run_date + interval '1 year')::date
    end;

    update recurring_transactions
      set last_run_date = rec.next_run_date, next_run_date = v_next_date
      where id = rec.id;
  end loop;
end;
$$;
