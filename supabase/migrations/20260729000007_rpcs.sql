-- Migration 007 — critical RPCs (docs/02-DATA-MODEL.md §007)
-- Rollback: drop functions create_order, commit_paid_order, release_expired_reservations;
--           unschedule the cron jobs.

-- Price/stock-authoritative order creation. Called from trusted server code only.
create function public.create_order(
  p_cart_id uuid,
  p_email text,
  p_phone text,
  p_ship_to jsonb,
  p_zone_id uuid,
  p_coupon text default null,
  p_user_id uuid default null
) returns orders language plpgsql security definer set search_path = public as $$
declare
  v_order orders;
  v_sub bigint := 0;
  v_ship bigint;
  v_disc bigint := 0;
  v_num text;
  v_attempts int := 0;
begin
  perform 1 from carts where id = p_cart_id for update;

  -- lock variants, validate stock against live price
  perform 1 from product_variants v
    join cart_items ci on ci.variant_id = v.id
   where ci.cart_id = p_cart_id for update;

  if exists (
    select 1 from cart_items ci
    join product_variants v on v.id = ci.variant_id
    where ci.cart_id = p_cart_id and (v.stock - v.reserved) < ci.qty
  ) then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  select coalesce(sum(v.price * ci.qty), 0) into v_sub
    from cart_items ci
    join product_variants v on v.id = ci.variant_id
   where ci.cart_id = p_cart_id;
  if v_sub = 0 then raise exception 'EMPTY_CART'; end if;

  select case when free_over is not null and v_sub >= free_over then 0 else base_fee end
    into v_ship
    from shipping_zones
   where id = p_zone_id and is_active;
  if v_ship is null then raise exception 'INVALID_ZONE'; end if;

  if p_coupon is not null then
    select case kind
             when 'percent' then v_sub * value / 100
             when 'fixed' then least(value, v_sub)
             else 0
           end,
           case kind when 'free_shipping' then 0 else v_ship end
      into v_disc, v_ship
      from coupons
     where code = p_coupon
       and is_active
       and v_sub >= min_subtotal
       and (starts_at is null or now() >= starts_at)
       and (ends_at is null or now() <= ends_at)
       and (max_redemptions is null or redemption_count < max_redemptions);
    if v_disc is null then raise exception 'INVALID_COUPON'; end if;
  end if;

  -- Insert with a fresh order number, retrying on the rare unique clash
  -- (24-bit daily suffix; uniqueness enforced by orders.order_number).
  loop
    v_num := 'EL-' || to_char(now(), 'YYYYMMDD') || '-' ||
             upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6));
    begin
      insert into orders (order_number, user_id, email, phone, subtotal, shipping_fee, discount,
                          total, ship_to, zone_id, coupon_code, reserved_until)
      values (v_num, p_user_id, p_email, p_phone, v_sub, v_ship, v_disc,
              v_sub + v_ship - v_disc, p_ship_to, p_zone_id, p_coupon, now() + interval '15 minutes')
      returning * into v_order;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 10 then raise; end if;
    end;
  end loop;

  insert into order_items (order_id, variant_id, sku, title, attrs, unit_price, qty, line_total, warranty_months)
  select v_order.id, v.id, v.sku, p.title, v.attrs, v.price, ci.qty, v.price * ci.qty, p.warranty_months
    from cart_items ci
    join product_variants v on v.id = ci.variant_id
    join products p on p.id = v.product_id
   where ci.cart_id = p_cart_id;

  update product_variants v set reserved = v.reserved + ci.qty
    from cart_items ci
   where ci.variant_id = v.id and ci.cart_id = p_cart_id;

  return v_order;
end $$;

-- Commit stock after verified payment. Idempotent on order.payment_status.
create function public.commit_paid_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform 1 from orders where id = p_order_id and payment_status <> 'paid' for update;
  if not found then return; end if; -- already committed

  for r in select variant_id, qty from order_items where order_id = p_order_id loop
    update product_variants
       set stock = stock - r.qty, reserved = greatest(reserved - r.qty, 0)
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
end $$;

-- Cron: every minute. Releases reservations for unpaid/expired pending orders.
create function public.release_expired_reservations() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  update product_variants v set reserved = greatest(v.reserved - oi.qty, 0)
    from order_items oi
    join orders o on o.id = oi.order_id
   where oi.variant_id = v.id
     and o.payment_status = 'unpaid'
     and o.status = 'pending'
     and o.reserved_until < now();

  update orders set status = 'cancelled', updated_at = now()
   where payment_status = 'unpaid' and status = 'pending' and reserved_until < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Schedule the reservation-release job when pg_cron is available (Supabase prod/local).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('release-reservations', '* * * * *',
      $c$select public.release_expired_reservations()$c$);
  end if;
end $$;

-- The reconcile-pending job posts to the reconcile-payments Edge Function (phase P7).
-- Configure in prod once the function is deployed (docs/02-DATA-MODEL.md §007):
--   select cron.schedule('reconcile-pending','*/10 * * * *', $c$select net.http_post(
--     url := 'https://<project>.functions.supabase.co/reconcile-payments',
--     headers := '{"Authorization":"Bearer <service_role>"}'::jsonb)$c$);
