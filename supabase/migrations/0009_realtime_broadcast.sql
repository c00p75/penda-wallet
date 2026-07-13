-- Supabase Realtime's classic postgres_changes (wal2json) path was not
-- reliably delivering events on this project even with the table in the
-- publication — Supabase's own current guidance is to use Broadcast for
-- database changes instead, authorized via RLS on realtime.messages.
create or replace function broadcast_transaction_changes()
returns trigger
security definer set search_path = ''
language plpgsql
as $$
begin
  perform realtime.broadcast_changes(
    'wallet:' || coalesce(new.wallet_id, old.wallet_id)::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

create trigger broadcast_transaction_changes_trigger
  after insert or update or delete on transactions
  for each row execute function broadcast_transaction_changes();

-- Only members of the wallet named in the topic ("wallet:<uuid>") may
-- receive its broadcasts.
create policy "wallet members can receive their wallet broadcasts"
  on realtime.messages for select
  to authenticated
  using (
    is_wallet_member(
      (regexp_match(topic, '^wallet:([0-9a-f-]{36})$'))[1]::uuid,
      'viewer'
    )
  );
