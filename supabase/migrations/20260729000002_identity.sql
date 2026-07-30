-- Migration 002 — identity (docs/02-DATA-MODEL.md §002)
-- Rollback: drop trigger on_auth_user_created; drop function handle_new_user;
--           drop table addresses; drop table profiles.
--
-- NOTE (divergence from doc): addresses.zone_id references shipping_zones, which is
-- created later in migration 004. To keep migrations forward-only and runnable in
-- order, the column is created here without the FK; the FK constraint is added in
-- migration 004 once shipping_zones exists.

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
  label text,
  recipient text not null,
  phone text not null,
  line1 text not null,
  line2 text,
  city text not null,
  region text not null,
  landmark text,
  zone_id uuid, -- FK to shipping_zones added in migration 004
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on addresses (user_id);

-- Auto-create a profile row on signup (works for email AND OAuth).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();
