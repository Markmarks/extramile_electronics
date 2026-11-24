-- Migration 013 — let staff record serial/IMEI numbers on order items
--
-- Bug this fixes:
-- The desktop console's serial capture (apps/desktop/src/lib/orders.ts captureSerials, and
-- its offline replay in lib/sync.ts) updates public.order_items.serials directly. Migration
-- 006 gives order_items a SELECT policy only, so under RLS that UPDATE matched 0 rows and
-- returned no error — the app reported success but nothing was saved.
--
-- Fix, scoped as narrowly as possible:
--   • An UPDATE policy on order_items for staff only (same is_staff() gate as staff_order).
--   • Column-level privileges so `authenticated` can update ONLY the serials column. Prices,
--     quantities, SKUs and line totals stay immutable from the API even for staff; they are
--     written by create_order (SECURITY DEFINER) and service_role only.
--
-- Rollback:
--   drop policy staff_order_item_serials on public.order_items;
--   revoke update (serials) on public.order_items from authenticated;
--   grant update on public.order_items to authenticated;   -- restores migration 011's grant

revoke update on public.order_items from authenticated;
grant update (serials) on public.order_items to authenticated;

create policy staff_order_item_serials on public.order_items
  for update
  using (is_staff())
  with check (is_staff());
