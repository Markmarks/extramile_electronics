-- Migration 003 — catalogue (docs/02-DATA-MODEL.md §003)
-- Rollback: drop tables inventory_movements, product_images, product_variants,
--           products, brands, categories.

create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  spec_schema jsonb not null default '{}', -- allowed spec keys + types + facet flags
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  logo_path text
);

create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  brand_id uuid not null references brands(id),
  title text not null,
  slug text not null unique,
  model text,
  description text,
  specs jsonb not null default '{}',
  condition product_cond not null default 'new',
  warranty_months int not null default 12,
  warranty_provider text,
  is_active boolean not null default false,
  rating_avg numeric(2, 1) not null default 0,
  rating_count int not null default 0,
  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(model, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'D')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on products using gin (search_tsv);
create index on products using gin (title gin_trgm_ops);
create index on products using gin (specs jsonb_path_ops);
create index on products (category_id, is_active);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text not null unique,
  attrs jsonb not null default '{}', -- {"color":"Titanium","storage":"256GB"}
  price bigint not null check (price > 0), -- pesewas
  compare_at_price bigint check (compare_at_price > price),
  stock int not null default 0 check (stock >= 0),
  reserved int not null default 0 check (reserved >= 0),
  weight_grams int not null default 500,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on product_variants (product_id);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete set null,
  storage_path text not null,
  alt text,
  sort_order int not null default 0
);

create table inventory_movements (
  id bigserial primary key,
  variant_id uuid not null references product_variants(id),
  delta int not null,
  reason text not null, -- 'purchase','sale','return','adjust','oversold'
  order_id uuid,
  actor uuid references profiles(id),
  created_at timestamptz not null default now()
);
