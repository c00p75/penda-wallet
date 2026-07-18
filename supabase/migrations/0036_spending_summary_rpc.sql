-- Exact spending totals for the chat agent's get_spending_summary tool.
--
-- Audit finding: the tool pulled up to 1000 raw transaction rows into the
-- edge function and summed them in JS — silently WRONG past 1000 rows (a
-- heavy user asking "what did I spend this year?" got a truncated total with
-- no warning) and needlessly heavy on data transfer. Aggregate in SQL
-- instead: exact at any volume, one row out.
--
-- security invoker (the default): runs as the calling user, so RLS on
-- transactions scopes it to wallets the caller is a member of — a non-member
-- simply aggregates zero rows and gets zeros back.
create or replace function get_wallet_spending_summary(p_wallet_id uuid, p_since date, p_until date)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'expense_minor',  coalesce(sum(t.amount_minor) filter (where t.type = 'expense'), 0),
    'income_minor',   coalesce(sum(t.amount_minor) filter (where t.type = 'income'), 0),
    'expense_count',  count(*) filter (where t.type = 'expense'),
    'top_categories', coalesce((
      select jsonb_agg(
               jsonb_build_object('name', top.name, 'amount_minor', top.total)
               order by top.total desc
             )
      from (
        select coalesce(c.name, 'Uncategorized') as name, sum(t2.amount_minor) as total
        from transactions t2
        left join categories c on c.id = t2.category_id
        where t2.wallet_id = p_wallet_id
          and t2.deleted_at is null
          and t2.type = 'expense'
          and t2.transaction_date between p_since and p_until
        group by 1
        order by total desc
        limit 3
      ) top
    ), '[]'::jsonb)
  )
  from transactions t
  where t.wallet_id = p_wallet_id
    and t.deleted_at is null
    and t.transaction_date between p_since and p_until;
$$;

grant execute on function get_wallet_spending_summary(uuid, date, date) to authenticated;
