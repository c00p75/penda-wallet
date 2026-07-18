-- Optional photo for a savings goal (e.g. the trip, the car), shown on goal
-- cards. Public bucket: unlike receipts, these are cosmetic images meant to
-- be seen by every wallet member, not sensitive financial data, so reads
-- don't need a signed-URL round trip.
alter table savings_goals add column image_path text;

insert into storage.buckets (id, name, public)
values ('goal-images', 'goal-images', true)
on conflict (id) do nothing;

-- Path convention: {wallet_id}/{filename} — any wallet editor can manage a
-- goal's image; reads are public since the bucket itself is public.
create policy "wallet editors manage goal images"
  on storage.objects for all
  using (bucket_id = 'goal-images' and is_wallet_member((storage.foldername(name))[1]::uuid, 'editor'))
  with check (bucket_id = 'goal-images' and is_wallet_member((storage.foldername(name))[1]::uuid, 'editor'));
