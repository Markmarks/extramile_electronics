/**
 * In-process Postgres (PGlite, WASM) with just enough Supabase scaffolding — API roles,
 * auth.users/auth.uid(), storage.objects — to run every file in supabase/migrations in
 * order and exercise RLS, grants, triggers and RPCs for real. No Docker, no network.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

export const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../supabase/migrations', import.meta.url),
);

const SUPABASE_PRELUDE = `
  -- Same extension layout as the hosted project: pgcrypto lives in "extensions" and the
  -- database search_path does NOT include it, so a function pinned to
  -- search_path = public can't see gen_random_bytes() — exactly the production bug fixed
  -- by migration 20261124000005. pg_trgm is in public there too.
  create schema extensions;
  create extension pgcrypto schema extensions;
  create extension pg_trgm schema public;

  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;

  create schema storage;
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text,
    name text
  );
  alter table storage.objects enable row level security;
`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function freshDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto, pg_trgm } });
  await db.exec(SUPABASE_PRELUDE);
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (e) {
      throw new Error(`migration ${file} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

export type Role = 'anon' | 'authenticated' | 'service_role';

/** Run `fn` as an API role (and optional signed-in user), like PostgREST does. */
export async function as<T>(
  db: PGlite,
  role: Role,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    if (userId) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    return fn(tx);
  });
}

export async function createUser(
  db: PGlite,
  role: 'customer' | 'staff' | 'admin',
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email) values ($1) returning id`,
    [`${role}-${Math.random().toString(36).slice(2)}@example.test`],
  );
  const id = rows[0]!.id;
  await db.query(`update profiles set role = $1 where id = $2`, [role, id]);
  return id;
}

/** A pending order for `qty` of the first seeded variant, created through create_order. */
export async function createPendingOrder(
  db: PGlite,
  qty = 1,
  variantSku?: string,
): Promise<{ orderId: string; variantId: string }> {
  const { rows: v } = await db.query<{ id: string }>(
    variantSku
      ? `select id from product_variants where sku = $1`
      : `select id from product_variants where stock >= 5 order by sku limit 1`,
    variantSku ? [variantSku] : [],
  );
  const variantId = v[0]!.id;
  const { rows: z } = await db.query<{ id: string }>(
    `insert into shipping_zones (name, base_fee) values ('Test zone', 2000) returning id`,
  );
  const { rows: c } = await db.query<{ id: string }>(
    `insert into carts (token) values (gen_random_uuid()::text) returning id`,
  );
  await db.query(
    `insert into cart_items (cart_id, variant_id, qty, added_price)
                  select $1, id, $2, price from product_variants where id = $3`,
    [c[0]!.id, qty, variantId],
  );
  const orderId = await as(db, 'service_role', null, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `select (create_order($1, 'buyer@example.test', '+233244123456', '{}'::jsonb, $2)).id`,
      [c[0]!.id, z[0]!.id],
    );
    return rows[0]!.id;
  });
  return { orderId, variantId };
}

export async function variantCounts(db: PGlite, variantId: string) {
  const { rows } = await db.query<{ stock: number; reserved: number }>(
    `select stock, reserved from product_variants where id = $1`,
    [variantId],
  );
  return rows[0]!;
}

export async function orderRow(db: PGlite, orderId: string) {
  const { rows } = await db.query<{
    status: string;
    payment_status: string;
    reserved_until: string | null;
  }>(`select status, payment_status, reserved_until from orders where id = $1`, [orderId]);
  return rows[0]!;
}
