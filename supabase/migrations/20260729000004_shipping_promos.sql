-- Migration 004 — shipping & promos (docs/02-DATA-MODEL.md §004)
-- Rollback: drop table coupon_redemptions, coupons, shipping_zones;
--           alter table addresses drop constraint addresses_zone_id_fkey.

create table shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- 'Accra Central','Greater Accra','Other Region','Pickup'
  base_fee bigint not null,
  free_over bigint, -- free shipping threshold, null = never
  eta_days_min int not null default 1,
  eta_days_max int not null default 3,
  is_active boolean not null default true
);

-- Deferred FK from migration 002 (addresses created before shipping_zones existed).
alter table addresses
  add constraint addresses_zone_id_fkey foreign key (zone_id) references shipping_zones(id);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind coupon_kind not null,
  value bigint not null default 0,
  min_subtotal bigint not null default 0,
  max_redemptions int,
  per_user_limit int not null default 1,
  redemption_count int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
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
