-- Atomic multi-tool chains (roadmap bet #4): borrowing or lending money is a
-- two-sided event — a wallet transaction AND a debt — that the chat agent
-- previously recorded as two independent tool calls (create_transaction then
-- create_debt). If the second insert failed after the first succeeded, the
-- ledger was left half-updated with no way to recover automatically. This
-- RPC does both inserts in a single Postgres function call: if either insert
-- raises, the whole call rolls back and neither row is left behind.

create function log_borrow_or_lend(
  p_wallet_id uuid,
  p_direction text,
  p_amount_minor bigint,
  p_currency text,
  p_debt_name text,
  p_counterparty text,
  p_due_date date,
  p_category_id uuid,
  p_transaction_date date
)
returns table (transaction_id uuid, debt_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx_id uuid;
  v_debt_id uuid;
  v_tx_type text;
begin
  if p_direction not in ('i_owe', 'owed_to_me') then
    raise exception 'direction must be i_owe or owed_to_me';
  end if;
  if not is_wallet_member(p_wallet_id, 'editor') then
    raise exception 'not authorized to write to this wallet';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- Borrowing (i_owe) means cash came IN; lending (owed_to_me) means cash went OUT.
  v_tx_type := case when p_direction = 'i_owe' then 'income' else 'expense' end;

  insert into transactions (
    wallet_id, created_by, category_id, amount_minor, currency, type,
    merchant, description, transaction_date, source, user_confirmed
  ) values (
    p_wallet_id, auth.uid(), p_category_id, p_amount_minor, p_currency, v_tx_type,
    p_counterparty, p_debt_name, coalesce(p_transaction_date, current_date), 'chat', true
  ) returning id into v_tx_id;

  insert into debts (
    wallet_id, name, direction, counterparty, principal_minor, balance_minor, due_date
  ) values (
    p_wallet_id, p_debt_name, p_direction, p_counterparty, p_amount_minor, p_amount_minor, p_due_date
  ) returning id into v_debt_id;

  transaction_id := v_tx_id;
  debt_id := v_debt_id;
  return next;
end;
$$;

grant execute on function log_borrow_or_lend(uuid, text, bigint, text, text, text, date, uuid, date) to authenticated;
