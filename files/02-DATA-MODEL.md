# Data Model — Supabase / Postgres

Conventions: money = `bigint` **pesewas** (100 = GHS 1). Timestamps `timestamptz default now()`. UUID v4 PKs. RLS enabled on **every** table. Writes to orders/payments/stock happen only via `security definer` RPCs or Edge Functions using `service_role`.

## Migration 001 — extensions & enums

```sql
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

create type user_role      as enum ('customer','staff','admin');
create type product_cond   as enum ('new','open_box','refurbished');
create type order_status   as enum ('pending','confirmed','packed','dispatched','delivered','cancelled','refunded','oversold');
create type payment_status as enum ('unpaid','processing','paid','failed','refunded','partially_refunded');
create type pay_provider   as enum ('paystack');
create type coupon_kind    as enum ('percent','fixed','free_shipping');
```

## Migration 002 — identity

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  phone text check (phone ~ '^\+233[0-9]{9}$'),
  role user_role not null default 'customer',
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text, recipient text not null, phone text not null,
  line1 text not null, line2 text, city text not null,
  region text not null, landmark text,
  zone_id uuid references shipping_zones(id),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on addresses(user_id);

-- auto-create profile on signup (works for email AND OAuth)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();
```

## Migration 003 — catalogue

```sql
create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories(id) on delete set null,
  name text not null, slug text not null unique,
  spec_schema jsonb not null default '{}',   -- allowed spec keys + types + facet flags
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, slug text not null unique, logo_path text
);

create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  brand_id uuid not null references brands(id),
  title text not null, slug text not null unique,
  model text, description text,
  specs jsonb not null default '{}',
  condition product_cond not null default 'new',
  warranty_months int not null default 12,
  warranty_provider text,
  is_active boolean not null default false,
  rating_avg numeric(2,1) not null default 0,
  rating_count int not null default 0,
  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(model,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'D')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on products using gin(search_tsv);
create index on products using gin(title gin_trgm_ops);
create index on products using gin(specs jsonb_path_ops);
create index on products(category_id, is_active);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text not null unique,
  attrs jsonb not null default '{}',          -- {"color":"Titanium","storage":"256GB"}
  price bigint not null check (price > 0),    -- pesewas
  compare_at_price bigint check (compare_at_price > price),
  stock int not null default 0 check (stock >= 0),
  reserved int not null default 0 check (reserved >= 0),
  weight_grams int not null default 500,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on product_variants(product_id);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete set null,
  storage_path text not null, alt text, sort_order int not null default 0
);

create table inventory_movements (
  id bigserial primary key,
  variant_id uuid not null references product_variants(id),
  delta int not null, reason text not null,        -- 'purchase','sale','return','adjust','oversold'
  order_id uuid, actor uuid references profiles(id),
  created_at timestamptz not null default now()
);
```

## Migration 004 — shipping & promos

```sql
create table shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- 'Accra Central','Greater Accra','Other Region','Pickup'
  base_fee bigint not null,
  free_over bigint,                  -- free shipping threshold, null = never
  eta_days_min int not null default 1, eta_days_max int not null default 3,
  is_active boolean not null default true
);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind coupon_kind not null,
  value bigint not null default 0,
  min_subtotal bigint not null default 0,
  max_redemptions int, per_user_limit int not null default 1,
  redemption_count int not null default 0,
  starts_at timestamptz, ends_at timestamptz,
  is_active boolean not null default true
);

create table coupon_redemptions (
  id bigserial primary key,
  coupon_id uuid not null references coupons(id),
  user_id uuid references profiles(id),
  order_id uuid not null,
  created_at timestamptz not null default now(),
  unique (coupon_id, order_id)
);
```

## Migration 005 — cart, orders, payments

```sql
create table carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  token text unique,                 -- guest cookie token
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or token is not null)
);

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  variant_id uuid not null references product_variants(id),
  qty int not null check (qty > 0 and qty <= 20),
  added_price bigint not null,        -- for stale-price detection only
  unique (cart_id, variant_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,          -- 'EL-20260729-4F2K'
  user_id uuid references profiles(id),
  email text not null, phone text not null,
  status order_status not null default 'pending',
  payment_status payment_status not null default 'unpaid',
  subtotal bigint not null, shipping_fee bigint not null default 0,
  discount bigint not null default 0, tax bigint not null default 0,
  total bigint not null check (total >= 0),
  currency char(3) not null default 'GHS',
  coupon_code text,
  ship_to jsonb not null,                     -- immutable address snapshot
  zone_id uuid references shipping_zones(id),
  reserved_until timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on orders(user_id, created_at desc);
create index on orders(status) where status = 'pending';

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  variant_id uuid references product_variants(id),
  sku text not null, title text not null, attrs jsonb not null default '{}',
  unit_price bigint not null, qty int not null check (qty > 0),
  line_total bigint not null,
  warranty_months int not null default 0,
  serials text[] not null default '{}'
);
create index on order_items(order_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  provider pay_provider not null default 'paystack',
  reference text not null unique,              -- sent to Paystack
  provider_txn_id text,
  channel text,                               -- mobile_money|card|bank_transfer|ussd
  amount bigint not null, currency char(3) not null default 'GHS',
  status text not null default 'initialized',
  authorization jsonb, raw jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index on payments(order_id);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  payment_id uuid not null references payments(id),
  amount bigint not null, reason text,
  provider_ref text, status text not null default 'pending',
  actor uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table webhook_events (
  event_id text primary key,                  -- Paystack event id / signature digest
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  actor uuid, action text not null, entity text not null, entity_id text,
  before jsonb, after jsonb,
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  order_id uuid references orders(id),
  rating int not null check (rating between 1 and 5),
  title text, body text,
  is_verified_purchase boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);

create table wishlist_items (
  user_id uuid not null references profiles(id) on delete cascade,
  variant_id uuid not null references product_variants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, variant_id)
);
```

## Migration 006 — RLS

```sql
alter table profiles, addresses, categories, brands, products, product_variants,
  product_images, inventory_movements, shipping_zones, coupons, coupon_redemptions,
  carts, cart_items, orders, order_items, payments, refunds, webhook_events,
  audit_log, reviews, wishlist_items enable row level security;

create function public.is_staff() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('staff','admin'));
$$;

-- public catalogue read
create policy pub_read_cat  on categories        for select using (is_active);
create policy pub_read_brd  on brands            for select using (true);
create policy pub_read_prd  on products          for select using (is_active);
create policy pub_read_var  on product_variants  for select using (
  is_active and exists (select 1 from products p where p.id = product_id and p.is_active));
create policy pub_read_img  on product_images    for select using (true);
create policy pub_read_zone on shipping_zones    for select using (is_active);
create policy pub_read_rev  on reviews           for select using (is_published);

-- staff full control of catalogue
create policy staff_cat on categories       for all using (is_staff()) with check (is_staff());
create policy staff_brd on brands           for all using (is_staff()) with check (is_staff());
create policy staff_prd on products         for all using (is_staff()) with check (is_staff());
create policy staff_var on product_variants for all using (is_staff()) with check (is_staff());
create policy staff_img on product_images   for all using (is_staff()) with check (is_staff());
create policy staff_inv on inventory_movements for all using (is_staff()) with check (is_staff());
create policy staff_cpn on coupons          for all using (is_staff()) with check (is_staff());

-- own data
create policy own_profile   on profiles  for select using (id = auth.uid() or is_staff());
create policy upd_profile   on profiles  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
create policy own_address   on addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_wishlist  on wishlist_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_cart      on carts     for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_cart_item on cart_items for all
  using (exists (select 1 from carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from carts c where c.id = cart_id and c.user_id = auth.uid()));

-- orders: read own, never write directly
create policy own_order      on orders      for select using (user_id = auth.uid() or is_staff());
create policy own_order_item on order_items for select using (
  exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_staff())));
create policy own_payment    on payments    for select using (
  exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_staff())));
create policy staff_order    on orders      for update using (is_staff()) with check (is_staff());

-- own reviews (only if delivered order exists)
create policy write_review on reviews for insert with check (
  user_id = auth.uid() and exists (
    select 1 from orders o join order_items oi on oi.order_id = o.id
    join product_variants v on v.id = oi.variant_id
    where o.user_id = auth.uid() and o.status = 'delivered' and v.product_id = reviews.product_id));

-- no policies at all on: webhook_events, audit_log, refunds → service_role only
```

Guest carts are **not** reachable by anon RLS; all guest cart reads/writes go through server routes that hold the cookie token and use `service_role`.

## Migration 007 — critical RPCs

```sql
-- price/stock-authoritative order creation. Called from server only.
create function public.create_order(
  p_cart_id uuid, p_email text, p_phone text, p_ship_to jsonb,
  p_zone_id uuid, p_coupon text default null, p_user_id uuid default null
) returns orders language plpgsql security definer set search_path = public as $$
declare v_order orders; v_sub bigint := 0; v_ship bigint; v_disc bigint := 0; v_num text;
begin
  perform 1 from carts where id = p_cart_id for update;

  -- lock variants, validate stock against live price
  perform 1 from product_variants v
    join cart_items ci on ci.variant_id = v.id
   where ci.cart_id = p_cart_id for update;

  if exists (select 1 from cart_items ci join product_variants v on v.id = ci.variant_id
             where ci.cart_id = p_cart_id and (v.stock - v.reserved) < ci.qty) then
    raise exception 'INSUFFICIENT_STOCK';
  end if;

  select coalesce(sum(v.price * ci.qty),0) into v_sub
    from cart_items ci join product_variants v on v.id = ci.variant_id
   where ci.cart_id = p_cart_id;
  if v_sub = 0 then raise exception 'EMPTY_CART'; end if;

  select case when free_over is not null and v_sub >= free_over then 0 else base_fee end
    into v_ship from shipping_zones where id = p_zone_id and is_active;
  if v_ship is null then raise exception 'INVALID_ZONE'; end if;

  if p_coupon is not null then
    select case kind when 'percent' then v_sub * value / 100
                     when 'fixed' then least(value, v_sub)
                     else 0 end,
           case kind when 'free_shipping' then 0 else v_ship end
      into v_disc, v_ship
      from coupons
     where code = p_coupon and is_active
       and v_sub >= min_subtotal
       and (starts_at is null or now() >= starts_at)
       and (ends_at is null or now() <= ends_at)
       and (max_redemptions is null or redemption_count < max_redemptions);
    if v_disc is null then raise exception 'INVALID_COUPON'; end if;
  end if;

  v_num := 'EL-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(3),'hex'),1,6));

  insert into orders (order_number,user_id,email,phone,subtotal,shipping_fee,discount,
                      total,ship_to,zone_id,coupon_code,reserved_until)
  values (v_num,p_user_id,p_email,p_phone,v_sub,v_ship,v_disc,
          v_sub + v_ship - v_disc,p_ship_to,p_zone_id,p_coupon,now() + interval '15 minutes')
  returning * into v_order;

  insert into order_items (order_id,variant_id,sku,title,attrs,unit_price,qty,line_total,warranty_months)
  select v_order.id, v.id, v.sku, p.title, v.attrs, v.price, ci.qty, v.price * ci.qty, p.warranty_months
    from cart_items ci join product_variants v on v.id = ci.variant_id
    join products p on p.id = v.product_id
   where ci.cart_id = p_cart_id;

  update product_variants v set reserved = v.reserved + ci.qty
    from cart_items ci where ci.variant_id = v.id and ci.cart_id = p_cart_id;

  return v_order;
end $$;

-- commit stock after verified payment. Idempotent on order.payment_status.
create function public.commit_paid_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform 1 from orders where id = p_order_id and payment_status <> 'paid' for update;
  if not found then return; end if;   -- already committed

  for r in select variant_id, qty from order_items where order_id = p_order_id loop
    update product_variants
       set stock = stock - r.qty, reserved = greatest(reserved - r.qty, 0)
     where id = r.variant_id and stock >= r.qty;
    if not found then
      update orders set status='oversold', updated_at=now() where id = p_order_id;
      raise exception 'OVERSOLD:%', r.variant_id;
    end if;
    insert into inventory_movements(variant_id,delta,reason,order_id)
    values (r.variant_id, -r.qty, 'sale', p_order_id);
  end loop;

  update orders set payment_status='paid', status='confirmed',
         reserved_until=null, updated_at=now()
   where id = p_order_id;

  update coupons c set redemption_count = redemption_count + 1
    from orders o where o.id = p_order_id and o.coupon_code = c.code;
end $$;

-- cron: every minute
create function public.release_expired_reservations() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  for n in (select 1) loop end loop;
  update product_variants v set reserved = greatest(v.reserved - oi.qty, 0)
    from order_items oi join orders o on o.id = oi.order_id
   where oi.variant_id = v.id and o.payment_status = 'unpaid'
     and o.status = 'pending' and o.reserved_until < now();
  update orders set status = 'cancelled', updated_at = now()
   where payment_status = 'unpaid' and status = 'pending' and reserved_until < now();
  return n;
end $$;
```

Schedule with `pg_cron`:
```sql
select cron.schedule('release-reservations','* * * * *', $$select public.release_expired_reservations()$$);
select cron.schedule('reconcile-pending','*/10 * * * *', $$select net.http_post(
  url := 'https://<project>.functions.supabase.co/reconcile-payments',
  headers := '{"Authorization":"Bearer <service_role>"}'::jsonb)$$);
```

## Storage buckets
| Bucket | Public | Policy |
|---|---|---|
| `product-images` | yes (read) | write: `is_staff()` |
| `invoices` | no | read: owner via signed URL from server |
| `warranty-cards` | no | read: owner via signed URL |
