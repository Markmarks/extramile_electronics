-- Migration 20261124000003 — staff can record serials on order items.
-- Applied to the hosted project on 2026-11-24 outside the repo; reconstructed from the
-- live policy and column ACL. Idempotent.
--
-- The back-office captures IMEIs/serials at packing (apps/desktop/src/lib/orders.ts →
-- captureSerials). Migration 006 gave order_items a SELECT policy only, so that update
-- matched zero rows and silently saved nothing. Staff get an UPDATE policy, and the
-- authenticated role may update the `serials` column only — prices, quantities and
-- titles on an order stay immutable from the API.
-- Rollback: drop policy staff_order_item_serials; grant update on order_items to authenticated.

drop policy if exists staff_order_item_serials on public.order_items;
create policy staff_order_item_serials on public.order_items
  for update using (is_staff()) with check (is_staff());

revoke update on public.order_items from authenticated;
grant update (serials) on public.order_items to authenticated;
