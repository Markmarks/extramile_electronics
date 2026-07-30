-- Migration 005 — cart, orders, payments (docs/02-DATA-MODEL.md §005)
-- Rollback: drop tables wishlist_items, reviews, audit_log, webhook_events, refunds,
--           payments, order_items, orders, cart_items, carts.

create table carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  token text unique, -- guest cookie token
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or token is not null)
);

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  variant_id uuid not null references product_variants(id),
  qty int not null check (qty > 0 and qty <= 20),
  added_price bigint not null, -- for stale-price detection only
  unique (cart_id, variant_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique, -- 'EL-20260729-4F2K'
  user_id uuid references profiles(id),
  email text not null,
  phone text not null,
  status order_status not null default 'pending',
  payment_status payment_status not null default 'unpaid',
  subtotal bigint not null,
  shipping_fee bigint not null default 0,
  discount bigint not null default 0,
  tax bigint not null default 0,
  total bigint not null check (total >= 0),
  currency char(3) not null default 'GHS',
  coupon_code text,
  ship_to jsonb not null, -- immutable address snapshot
  zone_id uuid references shipping_zones(id),
  reserved_until timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on orders (user_id, created_at desc);
create index on orders (status) where status = 'pending';

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  variant_id uuid references product_variants(id),
  sku text not null,
  title text not null,
  attrs jsonb not null default '{}',
  unit_price bigint not null,
  qty int not null check (qty > 0),
  line_total bigint not null,
  warranty_months int not null default 0,
  serials text[] not null default '{}'
);
create index on order_items (order_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  provider pay_provider not null default 'paystack',
  reference text not null unique, -- sent to Paystack
  provider_txn_id text,
  channel text, -- mobile_money|card|bank_transfer|ussd
  amount bigint not null,
  currency char(3) not null default 'GHS',
  status text not null default 'initialized',
  "authorization" jsonb, -- quoted: reserved SQL keyword
  raw jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index on payments (order_id);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  payment_id uuid not null references payments(id),
  amount bigint not null,
  reason text,
  provider_ref text,
  status text not null default 'pending',
  actor uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table webhook_events (
  event_id text primary key, -- Paystack event id / signature digest
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  received_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  order_id uuid references orders(id),
  rating int not null check (rating between 1 and 5),
  title text,
  body text,
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
