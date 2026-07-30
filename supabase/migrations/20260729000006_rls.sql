-- Migration 006 — RLS (docs/02-DATA-MODEL.md §006)
-- Rollback: drop the policies below and disable row level security per table.
--
-- NOTE (divergence from doc): Postgres ALTER TABLE takes a single table name, so the
-- doc's `alter table a, b, c enable row level security` is split into one statement
-- per table below (same effect).

alter table profiles            enable row level security;
alter table addresses           enable row level security;
alter table categories          enable row level security;
alter table brands              enable row level security;
alter table products            enable row level security;
alter table product_variants    enable row level security;
alter table product_images      enable row level security;
alter table inventory_movements enable row level security;
alter table shipping_zones      enable row level security;
alter table coupons             enable row level security;
alter table coupon_redemptions  enable row level security;
alter table carts               enable row level security;
alter table cart_items          enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table payments            enable row level security;
alter table refunds             enable row level security;
alter table webhook_events      enable row level security;
alter table audit_log           enable row level security;
alter table reviews             enable row level security;
alter table wishlist_items      enable row level security;

create function public.is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('staff', 'admin'));
$$;

-- public catalogue read
create policy pub_read_cat  on categories       for select using (is_active);
create policy pub_read_brd  on brands           for select using (true);
create policy pub_read_prd  on products         for select using (is_active);
create policy pub_read_var  on product_variants for select using (
  is_active and exists (select 1 from products p where p.id = product_id and p.is_active)
);
create policy pub_read_img  on product_images   for select using (true);
create policy pub_read_zone on shipping_zones   for select using (is_active);
create policy pub_read_rev  on reviews          for select using (is_published);

-- staff full control of catalogue
create policy staff_cat on categories          for all using (is_staff()) with check (is_staff());
create policy staff_brd on brands              for all using (is_staff()) with check (is_staff());
create policy staff_prd on products            for all using (is_staff()) with check (is_staff());
create policy staff_var on product_variants    for all using (is_staff()) with check (is_staff());
create policy staff_img on product_images      for all using (is_staff()) with check (is_staff());
create policy staff_inv on inventory_movements for all using (is_staff()) with check (is_staff());
create policy staff_cpn on coupons             for all using (is_staff()) with check (is_staff());

-- own data
create policy own_profile on profiles for select using (id = auth.uid() or is_staff());
create policy upd_profile on profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
create policy own_address  on addresses      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_wishlist on wishlist_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_cart     on carts          for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_cart_item on cart_items for all
  using (exists (select 1 from carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from carts c where c.id = cart_id and c.user_id = auth.uid()));

-- orders: read own, never write directly
create policy own_order      on orders      for select using (user_id = auth.uid() or is_staff());
create policy own_order_item on order_items for select using (
  exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_staff()))
);
create policy own_payment    on payments    for select using (
  exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_staff()))
);
create policy staff_order    on orders      for update using (is_staff()) with check (is_staff());

-- own reviews (only if a delivered order exists)
create policy write_review on reviews for insert with check (
  user_id = auth.uid() and exists (
    select 1 from orders o
    join order_items oi on oi.order_id = o.id
    join product_variants v on v.id = oi.variant_id
    where o.user_id = auth.uid() and o.status = 'delivered' and v.product_id = reviews.product_id
  )
);

-- no policies at all on: webhook_events, audit_log, refunds -> service_role only
