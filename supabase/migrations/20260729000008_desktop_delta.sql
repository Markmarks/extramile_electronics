-- Migration 008 — desktop admin delta (docs/07-DESKTOP-ADMIN.md §9)
-- Rollback: drop tables outbox_receipts, staff_devices; drop type order_channel;
--   alter table orders drop column channel; alter table audit_log drop columns source, device_id;
--   alter table inventory_movements drop columns unit_cost, supplier.
--   (pay_provider enum value 'manual' cannot be dropped; leave it.)

alter type pay_provider add value if not exists 'manual'; -- cash / offline MoMo, walk-in sales

create type order_channel as enum ('online', 'walk_in');
alter table orders add column channel order_channel not null default 'online';

alter table audit_log
  add column source text not null default 'web', -- 'web' | 'desktop' | 'system'
  add column device_id text;

create table staff_devices (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  user_id uuid not null references profiles(id) on delete cascade,
  label text,
  os text,
  app_version text,
  is_revoked boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table staff_devices enable row level security;
create policy staff_dev_read on staff_devices for select using (is_staff());
-- inserts/updates via admin-actions Edge Function only

create table outbox_receipts (
  idempotency_key uuid primary key,
  device_id text not null,
  kind text not null,
  result jsonb,
  created_at timestamptz not null default now()
);
alter table outbox_receipts enable row level security; -- no policies: service_role only

-- inventory receiving needs cost for stock valuation reports
alter table inventory_movements add column unit_cost bigint, add column supplier text;
