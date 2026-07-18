-- One-shot free receipt-scan preview. Client localStorage alone is not a gate —
-- the edge function claims this flag before calling vision so free users get
-- exactly one attempt (success or AI failure still consumes the preview).
--
-- Unlimited testing without billing: update entitlements set plan = 'premium'
-- where user_id = '<your user id>';

alter table entitlements
  add column if not exists receipt_scan_preview_used boolean not null default false;

-- Returns true if the user may proceed with a receipt scan: already premium, or
-- successfully claimed their one free preview. Atomic claim prevents double use.
create or replace function claim_receipt_scan_preview(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  if is_premium(p_user_id) then
    return true;
  end if;

  update entitlements
  set receipt_scan_preview_used = true
  where user_id = p_user_id
    and receipt_scan_preview_used = false
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

grant execute on function claim_receipt_scan_preview(uuid) to authenticated;
