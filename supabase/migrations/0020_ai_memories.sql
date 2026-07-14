-- AI memory & the Financial Journal (roadmap bet 10). Penda remembers what you
-- told it — preferences, facts it learned, and your own journal entries with an
-- optional mood tag ("I stress-buy after work"). Scoped to the individual user
-- (not the wallet) since journalling is personal, even in a shared wallet.
create table ai_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  wallet_id uuid references wallets (id) on delete set null,
  kind text not null check (kind in ('note', 'mood', 'preference', 'fact')),
  content text not null,
  mood text,
  created_at timestamptz not null default now()
);

create index ai_memories_user_created_idx on ai_memories (user_id, created_at desc);

alter table ai_memories enable row level security;

create policy "read own memories" on ai_memories for select using (user_id = auth.uid());
create policy "write own memories" on ai_memories for insert with check (user_id = auth.uid());
create policy "update own memories" on ai_memories for update using (user_id = auth.uid());
create policy "delete own memories" on ai_memories for delete using (user_id = auth.uid());
