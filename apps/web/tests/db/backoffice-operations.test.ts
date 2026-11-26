/**
 * Back-office operations (migration 20261126000003): receive_stock, staff audit-log reads,
 * create_walk_in_order.
 * Run: pnpm --filter @extramile/web test:db
 */
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, freshDb, variantCounts } from './harness';

let db: PGlite;
let variantId: string;
let otherVariantId: string;
let price: number;

beforeAll(async () => {
  db = await freshDb();
  const { rows } = await db.query<{ id: string; price: number }>(
    `update product_variants set stock = 50, reserved = 0
      where id in (select id from product_variants where is_active order by sku limit 2)
      returning id, price::int as price`,
  );
  variantId = rows[0]!.id;
  price = rows[0]!.price;
  otherVariantId = rows[1]!.id;
}, 120_000);

const svc = <T>(sql: string, params: unknown[] = []) =>
  as(db, 'service_role', null, (tx) => tx.query<T>(sql, params));

describe('receive_stock', () => {
  it('adds stock and logs a receive movement with cost and supplier', async () => {
    const before = (await variantCounts(db, variantId)).stock;
    const { rows } = await svc<{ s: number }>(
      `select receive_stock($1, 5, 120000, '  Accra Wholesale  ') as s`,
      [variantId],
    );
    expect(rows[0]!.s).toBe(before + 5);
    const m = await db.query<{
      delta: number;
      reason: string;
      unit_cost: number;
      supplier: string;
    }>(
      `select delta, reason, unit_cost::int as unit_cost, supplier from inventory_movements
        where variant_id = $1 order by id desc limit 1`,
      [variantId],
    );
    expect(m.rows[0]).toEqual({
      delta: 5,
      reason: 'receive',
      unit_cost: 120000,
      supplier: 'Accra Wholesale',
    });
  });

  it('rejects zero, negative or huge quantities and negative cost', async () => {
    for (const qty of [0, -3, 10001]) {
      await expect(svc(`select receive_stock($1, $2)`, [variantId, qty])).rejects.toThrow(
        /INVALID_QTY/,
      );
    }
    await expect(svc(`select receive_stock($1, 1, -5)`, [variantId])).rejects.toThrow(
      /INVALID_COST/,
    );
  });

  it('is not callable by staff directly (only through admin-actions)', async () => {
    const staff = await createUser(db, 'staff');
    await expect(
      as(db, 'authenticated', staff, (tx) => tx.query(`select receive_stock($1, 1)`, [variantId])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('audit_log visibility', () => {
  it('staff can read it, customers cannot, nobody signed-in can write it', async () => {
    await svc(`insert into audit_log (action, entity) values ('test.event', 'test')`);
    const staff = await createUser(db, 'staff');
    const customer = await createUser(db, 'customer');
    const count = (uid: string) =>
      as(db, 'authenticated', uid, (tx) =>
        tx.query<{ n: number }>(`select count(*)::int as n from audit_log`),
      );
    expect((await count(staff)).rows[0]!.n).toBeGreaterThan(0);
    expect((await count(customer)).rows[0]!.n).toBe(0);
    await expect(
      as(db, 'authenticated', staff, (tx) =>
        tx.query(`insert into audit_log (action, entity) values ('forged', 'x')`),
      ),
    ).rejects.toThrow(/permission denied|row-level security/);
  });
});

describe('create_walk_in_order', () => {
  const sale = (items: unknown, method = 'cash', email: string | null = null) =>
    svc<{
      id: string;
      order_number: string;
      total: number;
      status: string;
      payment_status: string;
      channel: string;
    }>(
      `select (o).id, (o).order_number, (o).total::int as total, (o).status, (o).payment_status, (o).channel
         from (select create_walk_in_order($1::jsonb, $2, $3) as o) s`,
      [JSON.stringify(items), method, email],
    ).then((r) => r.rows[0]!);

  it('prices from the database, takes stock, records a paid manual payment', async () => {
    const before = await variantCounts(db, variantId);
    const o = await sale(
      [
        { variant_id: variantId, qty: 1, serials: ['356938035643809', ' '] },
        { variant_id: variantId, qty: 1, price: 1 }, // a client price is ignored
      ],
      'momo',
      ' Kofi@Example.TEST ',
    );
    expect(o).toMatchObject({
      total: price * 2,
      status: 'delivered',
      payment_status: 'paid',
      channel: 'walk_in',
    });
    expect(o.order_number).toMatch(/^EL-\d{8}-[A-F0-9]{6}$/);
    expect((await variantCounts(db, variantId)).stock).toBe(before.stock - 2);

    const items = await db.query<{ qty: number; serials: string[]; line_total: number }>(
      `select qty, serials, line_total::int as line_total from order_items where order_id = $1`,
      [o.id],
    );
    expect(items.rows).toEqual([{ qty: 2, serials: ['356938035643809'], line_total: price * 2 }]);
    const pay = await db.query<{
      provider: string;
      status: string;
      amount: number;
      channel: string;
    }>(
      `select provider, status, amount::int as amount, channel from payments where order_id = $1`,
      [o.id],
    );
    expect(pay.rows).toEqual([
      { provider: 'manual', status: 'paid', amount: price * 2, channel: 'momo' },
    ]);
    const em = await db.query<{ email: string }>(`select email from orders where id = $1`, [o.id]);
    expect(em.rows[0]!.email).toBe('kofi@example.test');
    const mv = await db.query<{ n: number }>(
      `select count(*)::int as n from inventory_movements where order_id = $1 and reason = 'walk_in_sale'`,
      [o.id],
    );
    expect(mv.rows[0]!.n).toBe(1);
  });

  it('refuses to sell units that are reserved for online orders', async () => {
    await db.query(`update product_variants set stock = 3, reserved = 2 where id = $1`, [
      otherVariantId,
    ]);
    await expect(sale([{ variant_id: otherVariantId, qty: 2 }])).rejects.toThrow(
      /INSUFFICIENT_STOCK/,
    );
    expect(await variantCounts(db, otherVariantId)).toEqual({ stock: 3, reserved: 2 });
    const o = await sale([{ variant_id: otherVariantId, qty: 1 }]);
    expect(o.status).toBe('delivered');
  });

  it('rejects bad input without writing anything', async () => {
    const n = async () =>
      (await db.query<{ n: number }>(`select count(*)::int as n from orders`)).rows[0]!.n;
    const before = await n();
    await expect(sale([])).rejects.toThrow(/EMPTY_SALE/);
    await expect(sale([{ variant_id: variantId, qty: 1 }], 'card')).rejects.toThrow(
      /INVALID_METHOD/,
    );
    await expect(sale([{ variant_id: variantId, qty: 0 }])).rejects.toThrow(/INVALID_QTY/);
    await expect(sale([{ variant_id: variantId, qty: 101 }])).rejects.toThrow(/INVALID_QTY/);
    await expect(
      sale([{ variant_id: '00000000-0000-0000-0000-000000000000', qty: 1 }]),
    ).rejects.toThrow(/VARIANT_NOT_FOUND/);
    expect(await n()).toBe(before);
  });

  it('is not callable by staff or customers directly', async () => {
    const staff = await createUser(db, 'staff');
    await expect(
      as(db, 'authenticated', staff, (tx) =>
        tx.query(`select create_walk_in_order($1::jsonb, 'cash')`, [
          JSON.stringify([{ variant_id: variantId, qty: 1 }]),
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
