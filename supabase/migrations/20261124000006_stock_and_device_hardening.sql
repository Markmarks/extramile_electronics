-- Migration 20261124000006 — atomic stock moves, a working device registry, and less
-- API surface. Found by the 2026-11-24 wiring/security review.
--
-- 1. adjust_stock(): admin-actions used to read stock, compute, then write it back. A sale
--    committing in between (commit_paid_order) was silently overwritten. One UPDATE now
--    does the arithmetic under the row lock and refuses to drop below what is reserved,
--    and the inventory movement is written in the same transaction.
-- 2. register_staff_device(): nothing ever inserted into staff_devices, so revoking a
--    lost/stolen back-office PC did nothing. The back-office registers itself on enrol
--    and on every PIN unlock and is told if it has been revoked; admin-actions refuses
--    privileged actions from a revoked device.
-- 3. orders_guard_status() is a trigger function; it was reachable via /rest/v1/rpc
--    (Supabase advisor). Triggers fire regardless of EXECUTE, so revoke it.
-- Rollback: drop function adjust_stock(uuid, int, text, uuid, uuid),
--   register_staff_device(text, text, text, text); grant execute on function
--   orders_guard_status() to public.

create or replace function public.adjust_stock(
  p_variant uuid,
  p_delta int,
  p_reason text,
  p_actor uuid default null,
  p_order uuid default null
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_stock int;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'INVALID_DELTA' using errcode = 'check_violation';
  end if;

  update product_variants
     set stock = stock + p_delta
   where id = p_variant
     and (p_delta > 0 or stock + p_delta >= reserved)
  returning stock into v_stock;

  if not found then
    if not exists (select 1 from product_variants where id = p_variant) then
      raise exception 'VARIANT_NOT_FOUND' using errcode = 'no_data_found';
    end if;
    raise exception 'WOULD_GO_BELOW_RESERVED: stock can''t drop below units held for orders'
      using errcode = 'check_violation';
  end if;

  insert into inventory_movements (variant_id, delta, reason, order_id, actor)
  values (p_variant, p_delta, p_reason, p_order, p_actor);

  return v_stock;
end $$;

revoke execute on function public.adjust_stock(uuid, int, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.adjust_stock(uuid, int, text, uuid, uuid) to service_role;

-- Called by the back-office with the staff member's own JWT. Returns true when this
-- device has been revoked (the app then wipes its PIN vault and signs out).
create or replace function public.register_staff_device(
  p_device_id text,
  p_label text default null,
  p_os text default null,
  p_app_version text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_revoked boolean;
begin
  if auth.uid() is null or not is_staff() then
    raise exception 'FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  if p_device_id is null or length(p_device_id) not between 8 and 100 then
    raise exception 'INVALID_DEVICE_ID' using errcode = 'check_violation';
  end if;

  insert into staff_devices (device_id, user_id, label, os, app_version, last_seen_at)
  values (p_device_id, auth.uid(), left(p_label, 120), left(p_os, 60), left(p_app_version, 40), now())
  on conflict (device_id) do update
    set user_id = excluded.user_id,
        label = coalesce(excluded.label, staff_devices.label),
        os = coalesce(excluded.os, staff_devices.os),
        app_version = coalesce(excluded.app_version, staff_devices.app_version),
        last_seen_at = now()
        -- is_revoked is deliberately NOT touched: re-enrolling can't un-revoke a device.
  returning is_revoked into v_revoked;

  return v_revoked;
end $$;

revoke execute on function public.register_staff_device(text, text, text, text) from public, anon;
grant execute on function public.register_staff_device(text, text, text, text)
  to authenticated, service_role;

revoke execute on function public.orders_guard_status() from public, anon, authenticated;
