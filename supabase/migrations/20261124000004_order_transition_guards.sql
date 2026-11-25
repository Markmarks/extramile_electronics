-- Migration 20261124000004 — order status rules enforced by the database.
--
-- Before this, any staff client could write any status (the storefront /admin checked
-- transitions in TypeScript; the back-office did not), and cancelling never gave stock
-- back. Now, whoever changes orders.status — storefront, back-office, Edge Function, cron:
--   1. the move must be legal per packages/core/src/order-state.ts (kept in sync by
--      apps/web/tests/db/migrations.test.ts);
--   2. a paid order can't simply be cancelled — refund it (admin-actions `refund`);
--   3. cancelling an order that still holds a reservation releases the reserved units;
--   4. updated_at moves with every status change.
-- Signed-in users lose direct UPDATE on orders: the back-office goes through the
-- admin-actions Edge Function (audit log + customer email), the storefront through its
-- server action — both as service_role.
-- Rollback: drop trigger orders_guard_status on orders; drop function orders_guard_status(),
--   order_transition_allowed(order_status, order_status); restore the 007 bodies of
--   release_expired_reservations() and commit_paid_order(); grant update on orders to
--   authenticated.

create or replace function public.order_transition_allowed(p_from order_status, p_to order_status)
returns boolean language sql immutable set search_path = public as $$
  select case p_from
    when 'pending'    then p_to in ('confirmed', 'cancelled', 'oversold')
    when 'confirmed'  then p_to in ('packed', 'cancelled', 'refunded')
    when 'packed'     then p_to in ('dispatched', 'cancelled', 'refunded')
    when 'dispatched' then p_to in ('delivered', 'refunded')
    when 'delivered'  then p_to in ('refunded')
    when 'oversold'   then p_to in ('refunded', 'cancelled')
    else false -- cancelled, refunded are terminal
  end;
$$;

create or replace function public.orders_guard_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- A payment that lands after the 15-minute reservation expired: commit_paid_order may
  -- revive the cancelled order (the customer has paid). Nothing else may.
  if not (old.status = 'cancelled' and new.status = 'confirmed'
          and current_setting('extramile.committing_payment', true) = 'on')
     and not order_transition_allowed(old.status, new.status) then
    raise exception 'INVALID_TRANSITION: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if new.status = 'cancelled' and old.payment_status in ('paid', 'partially_refunded') then
    raise exception 'PAID_ORDER_NEEDS_REFUND: order % is paid; refund it instead of cancelling',
      old.order_number using errcode = 'check_violation';
  end if;

  -- reserved_until is set by create_order and cleared once the reservation is converted
  -- (commit_paid_order) or released (here) — so it marks "units still held".
  if new.status = 'cancelled' and old.reserved_until is not null then
    update product_variants v
       set reserved = greatest(v.reserved - oi.qty, 0)
      from order_items oi
     where oi.order_id = old.id and oi.variant_id = v.id;
    new.reserved_until := null;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists orders_guard_status on public.orders;
create trigger orders_guard_status
  before update of status on public.orders
  for each row execute function public.orders_guard_status();

-- The cron job now only cancels; the trigger releases the reservation (exactly once).
create or replace function public.release_expired_reservations() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  update orders set status = 'cancelled'
   where payment_status = 'unpaid' and status = 'pending' and reserved_until < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Same as 007, except: only give back `reserved` while the reservation is still held
-- (a late payment after expiry had already been released — decrementing again stole other
-- orders' reservations), and flag the transaction so the guard allows cancelled → confirmed.
create or replace function public.commit_paid_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_held boolean;
begin
  select reserved_until is not null into v_held
    from orders where id = p_order_id and payment_status <> 'paid' for update;
  if not found then return; end if; -- already committed

  perform set_config('extramile.committing_payment', 'on', true);

  for r in select variant_id, qty from order_items where order_id = p_order_id loop
    update product_variants
       set stock = stock - r.qty,
           reserved = case when v_held then greatest(reserved - r.qty, 0) else reserved end
     where id = r.variant_id and stock >= r.qty;
    if not found then
      update orders set status = 'oversold', updated_at = now() where id = p_order_id;
      raise exception 'OVERSOLD:%', r.variant_id;
    end if;
    insert into inventory_movements (variant_id, delta, reason, order_id)
    values (r.variant_id, -r.qty, 'sale', p_order_id);
  end loop;

  update orders set payment_status = 'paid', status = 'confirmed',
         reserved_until = null, updated_at = now()
   where id = p_order_id;

  update coupons c set redemption_count = redemption_count + 1
    from orders o where o.id = p_order_id and o.coupon_code = c.code;

  perform set_config('extramile.committing_payment', 'off', true);
end $$;

-- create or replace keeps existing grants, but restate 20261124000002 for clarity.
revoke execute on function public.commit_paid_order(uuid) from public, anon, authenticated;
revoke execute on function public.release_expired_reservations() from public, anon, authenticated;
revoke execute on function public.order_transition_allowed(order_status, order_status) from public, anon;
grant execute on function public.commit_paid_order(uuid) to service_role;
grant execute on function public.release_expired_reservations() to service_role;

-- Status changes go through server code only (see header).
revoke update on public.orders from authenticated;
drop policy if exists staff_order on public.orders;
