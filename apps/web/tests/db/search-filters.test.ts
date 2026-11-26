/**
 * search_products() storage / RAM / price filters (migration 20261126000001).
 * Run: pnpm --filter @extramile/web test:db
 */
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, freshDb } from './harness';

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
}, 120_000);

type Args = {
  q?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  storage?: number | null;
  ram?: number | null;
};

async function search(a: Args): Promise<{ slug: string; specs: Record<string, unknown> }[]> {
  return as(db, 'anon', null, async (tx) => {
    const { rows } = await tx.query<{ slug: string; specs: Record<string, unknown> }>(
      `select slug, specs from search_products(
         q => $1, p_min_price => $2, p_max_price => $3,
         p_limit => 100, p_min_storage_gb => $4, p_min_ram_gb => $5)`,
      [a.q ?? '', a.minPrice ?? null, a.maxPrice ?? null, a.storage ?? null, a.ram ?? null],
    );
    return rows;
  });
}

describe('search_products memory + price filters', () => {
  it('without filters behaves as before', async () => {
    const all = await search({});
    expect(all.length).toBeGreaterThan(10);
  });

  it('storage filter keeps only products with at least that much storage', async () => {
    const rows = await search({ storage: 256 });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(Number(r.specs.storage_gb)).toBeGreaterThanOrEqual(256);
  });

  it('RAM filter keeps only products with at least that much RAM', async () => {
    const rows = await search({ ram: 16 });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(Number(r.specs.ram_gb)).toBeGreaterThanOrEqual(16);
  });

  it('products with no numeric spec (TVs, audio) are excluded only when filtering', async () => {
    const tvs = await search({ q: 'Bravia' });
    expect(tvs.length).toBeGreaterThan(0);
    expect(await search({ q: 'Bravia', ram: 4 })).toEqual([]);
  });

  it('price range is in pesewas against active variant prices', async () => {
    const cheap = await search({ maxPrice: 100_000 });
    const { rows } = await db.query<{ slug: string; min: number }>(
      `select p.slug, min(v.price)::int as min from products p join product_variants v
         on v.product_id = p.id and v.is_active where p.is_active group by p.slug`,
    );
    const expected = rows
      .filter((r) => r.min <= 100_000)
      .map((r) => r.slug)
      .sort();
    expect(cheap.map((r) => r.slug).sort()).toEqual(expected);
  });

  it('is callable by anon (public catalogue) and the old 10-arg overload is gone', async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc where proname = 'search_products'`,
    );
    expect(rows[0]!.n).toBe(1);
  });
});
