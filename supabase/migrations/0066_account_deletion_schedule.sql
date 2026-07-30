-- Soft-delete self-serve account deletion. delete-account now schedules a
-- 30-day-out wipe instead of running it immediately; restore-account clears
-- it; purge-deleted-accounts (see 0067) hard-deletes anything past due.
alter table profiles add column scheduled_deletion_at timestamptz;

create index profiles_scheduled_deletion_at_idx on profiles (scheduled_deletion_at)
  where scheduled_deletion_at is not null;
