-- Realtime requires each table to be explicitly added to the publication —
-- enabling the extension alone does not make postgres_changes fire.
alter publication supabase_realtime add table transactions;
