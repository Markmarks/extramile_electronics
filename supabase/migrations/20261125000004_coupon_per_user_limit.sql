-- Migration 20261125000004 — enforce coupons.per_user_limit and record every redemption.
--
-- Until now create_order() only checked max_redemptions / redemption_count, and
-- commit_paid_order() bumped redemption_count but never wrote coupon_redemptions — so a
-- "once per customer" code could be reused forever.
--
-- Now:
--   • commit_paid_order() writes one coupon_redemptions row per paid order that used a
--     coupon (same place redemption_count is bumped; unique (coupon_id, order_id) keeps it
--     idempotent).
--   • create_order() raises COUPON_LIMIT_REACHED when this customer already has
--     per_user_limit redemptions of the coupon.
--
-- Who is "this customer":
--   • Signed in (p_user_id set): redemptions with that user_id, OR with the order email.
--   • Guest (no user_id): redemptions with the order email.
--   Emails are compared trimmed + lower-cased (stored that way in coupon_redemptions.email),
--   so checking out as a guest with the same address, or signing in after a guest order,
--   does not reset the allowance. A guest can still use a *different* email address —
--   the email is the only identity a guest has.
--
-- Only paid orders count: an unpaid or abandoned checkout does not use up the allowance.
-- Known gap (accepted): two checkouts started at the same moment by the same customer can
-- both pass the check; if both are paid, both are recorded (payment is already taken by
-- then, so commit_paid_order must not refuse).
--
-- Existing paid orders that used a coupon are backfilled so past uses count too.
--
-- Rollback: restore create_order from 20260729000007 (+ search_path from
--   20261124000005) and commit_paid_order from 20261124000004;
--   drop index coupon_redemptions_coupon_user_idx, coupon_redemptions_coupon_email_idx;
--   alter table coupon_redemptions drop column email;

alter table public.coupon_redemptions add column email text;

create index coupon_redemptions_coupon_user_idx
  on public.coupon_redemptions (coupon_id, user_id) where user_id is not null;
create index coupon_redemptions_coupon_email_idx
  on public.coupon_redemptions (coupon_id, email) where email is not null;

-- Backfill: every already-paid order with a coupon is a redemption.
insert into public.coupon_redemptions (coupon_id, user_id, email, order_id, created_at)
select c.id, o.user_id, lower(btrim(o.email)), o.id, o.updated_at
  from public.orders o
  join public.coupons c on c.code = o.coupon_code
 where o.payment_status = 'paid'
on conflict (coupon_id, order_id) do nothing;

-- Same as 20260729000007 + search_path from 20261124000005, plus the per-customer check.
create or replace function public.create_order(
  p_cart_id uuid,
  p_email text,
  p_phone text,
  p_ship_to jsonb,
  p_zone_id uuid,
  p_coupon text default null,
  p_user_id uuid default null
) returns orders language plpgsql security definer set search_path = public, extensions as $$
declare
  v_order orders;
  v_sub bigint := 0;
  v_ship bigint;
  v_disc bigint := 0;
  v_num text;
  v_attempts int := 0;
  v_coupon_id uuid;
  v_per_user int;
  v_used int;
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
    select id,
           per_user_limit,
           case kind
             when 'percent' then v_sub * value / 100
             when 'fixed' then least(value, v_sub)
             else 0
           end,
           case kind when 'free_shipping' then 0 else v_ship end
      into v_coupon_id, v_per_user, v_disc, v_ship
      from coupons
     where code = p_coupon
       and is_active
       and v_sub >= min_subtotal
       and (starts_at is null or now() >= starts_at)
       and (ends_at is null or now() <= ends_at)
       and (max_redemptions is null or redemption_count < max_redemptions);
    if v_disc is null then raise exception 'INVALID_COUPON'; end if;

    select count(*) into v_used
      from coupon_redemptions r
     where r.coupon_id = v_coupon_id
       and ((p_user_id is not null and r.user_id = p_user_id)
            or r.email = lower(btrim(p_email)));
    if v_used >= v_per_user then raise exception 'COUPON_LIMIT_REACHED'; end if;
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

-- Same as 20261124000004, plus: record the redemption alongside redemption_count.
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

  insert into coupon_redemptions (coupon_id, user_id, email, order_id)
  select c.id, o.user_id, lower(btrim(o.email)), o.id
    from orders o join coupons c on c.code = o.coupon_code
   where o.id = p_order_id
  on conflict (coupon_id, order_id) do nothing;

  perform set_config('extramile.committing_payment', 'off', true);
end $$;

-- create or replace keeps existing grants; restate 20261124000002 / 000004 for clarity.
revoke execute on function public.create_order(uuid, text, text, jsonb, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.commit_paid_order(uuid) from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, text, jsonb, uuid, text, uuid)
  to service_role;
grant execute on function public.commit_paid_order(uuid) to service_role;
