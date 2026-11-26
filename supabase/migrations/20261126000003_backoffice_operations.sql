-- Migration — back-office operations (docs/07-DESKTOP-ADMIN.md §4).
--
-- 1. receive_stock(): goods in from a supplier. Adds stock and records the movement with
--    unit cost + supplier (columns from migration 008), so stock valuation and margin
--    reports have a cost basis. Service-role only — called by admin-actions `stock_receive`.
-- 2. audit_log becomes readable by staff (the back-office audit viewer). Still no write
--    policy: only service-role code (admin-actions) writes it.
-- 3. create_walk_in_order(): an in-store sale paid at the counter (cash or MoMo to the
--    shop's number). Prices come from the database, never the caller (README rule 1/4);
--    stock is checked against what is free (stock − reserved) under row locks and
--    decremented through adjust_stock(), which logs the movement. The order is created
--    already paid + delivered (the customer walks out with it), channel 'walk_in', with a
--    'manual' payment row. Service-role only — called by admin-actions `walk_in_sale`,
--    which supplies the idempotency key, actor and device.
--
-- Rollback: drop function receive_stock(uuid, int, bigint, text, uuid);
--           drop function create_walk_in_order(jsonb, text, text, text, text, uuid);
--           drop policy staff_audit_read on audit_log;

-- ── 1. Receiving ─────────────────────────────────────────────────────────────
create or replace function public.receive_stock(
  p_variant uuid,
  p_qty int,
  p_unit_cost bigint default null,
  p_supplier text default null,
  p_actor uuid default null
) returns int language plpgsql security definer set search_path = public as $$
declare
  v_stock int;
begin
  if p_qty is null or p_qty <= 0 or p_qty > 10000 then
    raise exception 'INVALID_QTY' using errcode = 'check_violation';
  end if;
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'INVALID_COST' using errcode = 'check_violation';
  end if;

  update product_variants set stock = stock + p_qty
   where id = p_variant
  returning stock into v_stock;
  if not found then
    raise exception 'VARIANT_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  insert into inventory_movements (variant_id, delta, reason, actor, unit_cost, supplier)
  values (p_variant, p_qty, 'receive', p_actor, p_unit_cost,
          nullif(left(btrim(coalesce(p_supplier, '')), 120), ''));
  return v_stock;
end $$;

revoke execute on function public.receive_stock(uuid, int, bigint, text, uuid)
  from public, anon, authenticated;
grant execute on function public.receive_stock(uuid, int, bigint, text, uuid) to service_role;

-- ── 2. Audit log viewer ─────────────────────────────────────────────────────
create policy staff_audit_read on public.audit_log for select using (is_staff());
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- ── 3. Walk-in sales ────────────────────────────────────────────────────────
-- p_items: [{"variant_id": "<uuid>", "qty": 1, "serials": ["IMEI…"]}, …]
-- p_method: 'cash' | 'momo'
create or replace function public.create_walk_in_order(
  p_items jsonb,
  p_method text,
  p_email text default null,
  p_phone text default null,
  p_customer text default null,
  p_actor uuid default null
) returns orders language plpgsql security definer set search_path = public, extensions as $$
declare
  v_order orders;
  v_sub bigint := 0;
  v_num text;
  v_attempts int := 0;
  r record;
begin
  if p_method is null or p_method not in ('cash', 'momo') then
    raise exception 'INVALID_METHOD' using errcode = 'check_violation';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_SALE' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'TOO_MANY_LINES' using errcode = 'check_violation';
  end if;

  -- Normalise the lines: one row per variant, qty summed (1..100), serials de-duplicated.
  drop table if exists _walk_in;
  create temporary table _walk_in on commit drop as
  with lines as (
    select (e ->> 'variant_id')::uuid as variant_id,
           (e ->> 'qty')::int as qty,
           case when jsonb_typeof(e -> 'serials') = 'array' then e -> 'serials'
                else '[]'::jsonb end as serials
      from jsonb_array_elements(p_items) e
  )
  select l.variant_id,
         sum(l.qty)::int as qty,
         coalesce((
           select array_agg(distinct left(btrim(s), 40))
             from lines l2, jsonb_array_elements_text(l2.serials) s
            where l2.variant_id = l.variant_id and btrim(s) <> ''
         ), '{}') as serials
    from lines l
   group by l.variant_id;

  if exists (select 1 from _walk_in where variant_id is null or qty is null or qty < 1 or qty > 100) then
    raise exception 'INVALID_QTY' using errcode = 'check_violation';
  end if;

  -- Lock the variants, then check they are sellable and free stock covers the sale.
  perform 1 from product_variants v join _walk_in w on w.variant_id = v.id
   order by v.id for update of v;

  if exists (
    select 1 from _walk_in w
    left join product_variants v on v.id = w.variant_id
    left join products p on p.id = v.product_id
    where v.id is null or not v.is_active or p.id is null
  ) then
    raise exception 'VARIANT_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if exists (
    select 1 from _walk_in w join product_variants v on v.id = w.variant_id
    where (v.stock - v.reserved) < w.qty
  ) then
    raise exception 'INSUFFICIENT_STOCK' using errcode = 'check_violation';
  end if;

  select sum(v.price * w.qty) into v_sub
    from _walk_in w join product_variants v on v.id = w.variant_id;

  loop
    v_num := 'EL-' || to_char(now(), 'YYYYMMDD') || '-' ||
             upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6));
    begin
      insert into orders (order_number, user_id, email, phone, status, payment_status,
                          subtotal, shipping_fee, discount, total, ship_to, channel, notes)
      values (v_num, null,
              coalesce(nullif(lower(btrim(coalesce(p_email, ''))), ''), 'walk-in@store.invalid'),
              coalesce(nullif(btrim(coalesce(p_phone, '')), ''), ''),
              'delivered', 'paid', v_sub, 0, 0, v_sub,
              jsonb_build_object('pickup', true,
                                 'name', nullif(left(btrim(coalesce(p_customer, '')), 120), '')),
              'walk_in',
              'Walk-in sale · ' || p_method)
      returning * into v_order;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= 10 then raise; end if;
    end;
  end loop;

  insert into order_items (order_id, variant_id, sku, title, attrs, unit_price, qty,
                           line_total, warranty_months, serials)
  select v_order.id, v.id, v.sku, p.title, v.attrs, v.price, w.qty, v.price * w.qty,
         p.warranty_months, w.serials
    from _walk_in w
    join product_variants v on v.id = w.variant_id
    join products p on p.id = v.product_id;

  for r in select variant_id, qty from _walk_in loop
    perform adjust_stock(r.variant_id, -r.qty, 'walk_in_sale', p_actor, v_order.id);
  end loop;

  insert into payments (order_id, provider, reference, channel, amount, currency, status, paid_at)
  values (v_order.id, 'manual', v_order.order_number || '-' || upper(p_method), p_method,
          v_sub, 'GHS', 'paid', now());

  return v_order;
end $$;

revoke execute on function public.create_walk_in_order(jsonb, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_walk_in_order(jsonb, text, text, text, text, uuid)
  to service_role;
