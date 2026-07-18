-- Enable multi-currency: service role upserts rates; clients read publicly.
-- Penda stores USD-pivot rates (base_currency = 'USD').

comment on table exchange_rates is
  'FX rates as quote per 1 base. App uses base_currency = USD for pivots.';

-- No authenticated INSERT policy — edge function uses service role.
-- Keep public SELECT (already in 0001).

-- Helper: amount in wallet base for aggregations.
create or replace function transaction_ledger_minor(t transactions)
returns bigint
language sql
immutable
as $$
  select coalesce(t.converted_amount_minor, t.amount_minor);
$$;
