/** `supabase db reset` = every migration, then supabase/seed.sql. CI's database job runs exactly that. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { MIGRATIONS_DIR, freshDb } from './harness';
it('migrations + seed.sql, as `supabase db reset` runs them', async () => {
  const db = await freshDb();
  await db.exec(readFileSync(join(MIGRATIONS_DIR, '..', 'seed.sql'), 'utf8'));
  const { rows } = await db.query<{ p: number; c: number; z: number }>(
    'select (select count(*)::int from products) p, (select count(*)::int from categories) c, (select count(*)::int from shipping_zones) z',
  );
  expect(rows[0]).toEqual({ p: 30, c: 5, z: 4 });
}, 120_000);
