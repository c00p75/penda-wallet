-- Full CRUD with tiered confirmation (roadmap bet #4).
--
-- The chat agent can now update and delete records, but those two operations
-- are a HARD guardrail in the tool layer: the update_record / delete_record
-- tools never mutate anything. They stage the resolved change here, the user
-- sees a "Yes / Cancel" card, and only the confirm-ai-action function — driven
-- by an explicit user tap — executes it. The model has no code path to a write.
--
-- This table doubles as the seed of the AI Action Audit Trail (Intelligence &
-- Trust): every staged change is recorded with who proposed it, the exact patch,
-- and how it resolved.
create table ai_pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  wallet_id uuid not null references wallets (id) on delete cascade,
  conversation_id uuid references chat_conversations (id) on delete set null,
  -- 'update' | 'delete'. Creates and reads are never staged; they run inline.
  kind text not null check (kind in ('update', 'delete')),
  -- Which domain the target lives in: transaction | debt | budget | goal | category | wallet.
  domain text not null,
  target_id uuid not null,
  -- The already-resolved, column-level patch for an update (db columns -> values),
  -- computed and validated at staging time so confirm applies it verbatim.
  patch jsonb,
  -- Human-readable one-liner shown on the confirmation card ("Change K10 tea to K15").
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index ai_pending_actions_user_pending_idx
  on ai_pending_actions (user_id, status);

alter table ai_pending_actions enable row level security;

-- A user only ever sees and resolves their own staged actions. The edge
-- function runs as the user (anon key + user JWT), so RLS is the outer fence;
-- the confirm function re-checks status = 'pending' as the inner one.
create policy "own pending actions - select" on ai_pending_actions
  for select using (user_id = auth.uid());
create policy "own pending actions - insert" on ai_pending_actions
  for insert with check (user_id = auth.uid() and is_wallet_member(wallet_id, 'editor'));
create policy "own pending actions - update" on ai_pending_actions
  for update using (user_id = auth.uid());
