-- Migration — stock changes only through adjust_stock (README rule 4).
--
-- Found in the 2026-11-25 wiring check: the back-office "Save variant" button wrote an
-- absolute number straight into product_variants.stock (staff had full UPDATE through
-- the staff_var policy). That
--   * lost any sale committed between loading the screen and pressing Save
--     (commit_paid_order's decrement was overwritten),
--   * could set stock below the units reserved for unpaid orders, and
--   * left no inventory_movements row, so the change was invisible in the stock log.
-- The back-office now sends a delta through admin-actions → adjust_stock(), one atomic
-- UPDATE that refuses to go below `reserved` and records the movement.
--
-- Here, signed-in users lose direct write access to the counters, so no client can
-- bypass that path again:
--   * product_variants: INSERT/UPDATE limited to descriptive columns. `stock` and
--     `reserved` are writable only by SECURITY DEFINER functions (create_order,
--     commit_paid_order, release_expired_reservations, adjust_stock, the order-status
--     trigger), which run as the table owner and are unaffected.
--   * inventory_movements: read-only for signed-in users. It is the stock audit trail;
--     only adjust_stock and the order functions write it.
-- RLS (staff_var / staff_inv) still decides which rows; these grants decide which columns.
--
-- Rollback: grant insert, update on product_variants, inventory_movements to authenticated;
--           (and grant delete on inventory_movements to authenticated).

revoke insert, update on public.product_variants from authenticated;
grant insert (product_id, sku, attrs, price, compare_at_price, weight_grams, is_active)
  on public.product_variants to authenticated;
grant update (sku, attrs, price, compare_at_price, weight_grams, is_active)
  on public.product_variants to authenticated;

revoke insert, update, delete on public.inventory_movements from authenticated;
