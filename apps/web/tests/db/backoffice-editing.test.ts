/**
 * Permissions behind the back-office editing screens (migration 20261125000002):
 * delivery zones, coupons, review moderation, email opt-outs, refund history.
 * Run: pnpm --filter @extramile/web test:db
 */
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, freshDb } from './harness';

let db: PGlite;
let admin: string;
let staff: string;
let customer: string;

beforeAll(async () => {
  db = await freshDb();
  admin = await createUser(db, 'admin');
  staff = await createUser(db, 'staff');
  customer = await createUser(db, 'customer');
}, 120_000);

const zoneId = async (name: string) =>
  (await db.query<{ id: string }>(`select id from shipping_zones where name = $1`, [name])).rows[0]!
    .id;

describe('delivery zones', () => {
  it('staff see every zone, including switched-off ones; customers only active ones', async () => {
    await db.query(`update shipping_zones set is_active = false where name = 'Other Region'`);
    const count = (uid: string) =>
      as(db, 'authenticated', uid, (tx) =>
        tx.query<{ n: number }>(`select count(*)::int n from shipping_zones`),
      );
    expect((await count(staff)).rows[0]!.n).toBe(4);
    expect((await count(customer)).rows[0]!.n).toBe(3);
    await db.query(`update shipping_zones set is_active = true where name = 'Other Region'`);
  });

  it('an admin can add a zone and change its fee', async () => {
    await as(db, 'authenticated', admin, (tx) =>
      tx.query(
        `insert into shipping_zones (name, base_fee, eta_days_min, eta_days_max)
         values ('Anywhere in Accra', 2000, 1, 2)`,
      ),
    );
    const id = await zoneId('Anywhere in Accra');
    const res = await as(db, 'authenticated', admin, (tx) =>
      tx.query(`update shipping_zones set base_fee = 2500, free_over = 600000 where id = $1`, [id]),
    );
    expect(res.affectedRows).toBe(1);
  });

  it('staff and customers cannot change zones; nobody can delete one', async () => {
    const id = await zoneId('Greater Accra');
    for (const uid of [staff, customer]) {
      const res = await as(db, 'authenticated', uid, (tx) =>
        tx.query(`update shipping_zones set base_fee = 1 where id = $1`, [id]),
      );
      expect(res.affectedRows).toBe(0);
      await expect(
        as(db, 'authenticated', uid, (tx) =>
          tx.query(`insert into shipping_zones (name, base_fee) values ('X', 1)`),
        ),
      ).rejects.toThrow(/row-level security/);
    }
    await expect(
      as(db, 'authenticated', admin, (tx) =>
        tx.query(`delete from shipping_zones where id = $1`, [id]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('rejects nonsense values', async () => {
    const id = await zoneId('Greater Accra');
    for (const sql of [
      `update shipping_zones set base_fee = -1 where id = $1`,
      `update shipping_zones set free_over = 0 where id = $1`,
      `update shipping_zones set eta_days_min = 3, eta_days_max = 1 where id = $1`,
      `update shipping_zones set name = '  ' where id = $1`,
    ]) {
      await expect(as(db, 'authenticated', admin, (tx) => tx.query(sql, [id]))).rejects.toThrow(
        /violates check constraint/,
      );
    }
  });
});

describe('coupons', () => {
  const insert = (uid: string, code: string, kind: string, value: number) =>
    as(db, 'authenticated', uid, (tx) =>
      tx.query(`insert into coupons (code, kind, value) values ($1, $2::coupon_kind, $3)`, [
        code,
        kind,
        value,
      ]),
    );

  it('admins create and edit coupons; staff only read them', async () => {
    await insert(admin, 'SALE15', 'percent', 15);
    const res = await as(db, 'authenticated', admin, (tx) =>
      tx.query(`update coupons set value = 20, is_active = false where code = 'SALE15'`),
    );
    expect(res.affectedRows).toBe(1);
    await expect(insert(staff, 'STAFF5', 'percent', 5)).rejects.toThrow(/row-level security/);
    const upd = await as(db, 'authenticated', staff, (tx) =>
      tx.query(`update coupons set value = 99 where code = 'SALE15'`),
    );
    expect(upd.affectedRows).toBe(0);
    const { rows } = await as(db, 'authenticated', staff, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from coupons`),
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(3);
  });

  it('the code and the redemption counter cannot be changed from the app', async () => {
    for (const sql of [
      `update coupons set code = 'NEWCODE' where code = 'SALE15'`,
      `update coupons set redemption_count = 0 where code = 'SALE15'`,
    ]) {
      await expect(as(db, 'authenticated', admin, (tx) => tx.query(sql))).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it('rejects impossible discounts and bad codes', async () => {
    await expect(insert(admin, 'TOOMUCH', 'percent', 150)).rejects.toThrow(/coupons_value_check/);
    await expect(insert(admin, 'ZEROFIX', 'fixed', 0)).rejects.toThrow(/coupons_value_check/);
    await expect(insert(admin, 'lower case', 'percent', 10)).rejects.toThrow(/coupons_code_check/);
  });
});

describe('reviews', () => {
  it('staff publish a review and the product rating follows the published reviews', async () => {
    const { rows: p } = await db.query<{ id: string }>(
      `select id from products order by title limit 1`,
    );
    const productId = p[0]!.id;
    await db.query(
      `insert into reviews (product_id, user_id, rating, body) values ($1, $2, 4, 'Good')`,
      [productId, customer],
    );
    const rating = async () =>
      (
        await db.query<{ a: string; n: number }>(
          `select rating_avg::text a, rating_count n from products where id = $1`,
          [productId],
        )
      ).rows[0]!;
    expect((await rating()).n).toBe(0); // unpublished reviews don't count

    const res = await as(db, 'authenticated', staff, (tx) =>
      tx.query(`update reviews set is_published = true where product_id = $1`, [productId]),
    );
    expect(res.affectedRows).toBe(1);
    expect(await rating()).toEqual({ a: '4.0', n: 1 });

    await as(db, 'authenticated', staff, (tx) =>
      tx.query(`update reviews set is_published = false where product_id = $1`, [productId]),
    );
    expect(await rating()).toEqual({ a: '0.0', n: 0 });
  });

  it('staff cannot rewrite a review; customers cannot publish their own', async () => {
    await expect(
      as(db, 'authenticated', staff, (tx) => tx.query(`update reviews set rating = 5`)),
    ).rejects.toThrow(/permission denied/);
    const res = await as(db, 'authenticated', customer, (tx) =>
      tx.query(`update reviews set is_published = true`),
    );
    expect(res.affectedRows).toBe(0);
  });
});

describe('email opt-outs and refunds', () => {
  it('staff read opt-outs; only admins add or lift one', async () => {
    await db.query(`insert into email_suppressions (email, reason) values ('a@x.test', 'bounce')`);
    const { rows } = await as(db, 'authenticated', staff, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from email_suppressions`),
    );
    expect(rows[0]!.n).toBe(1);
    const staffDel = await as(db, 'authenticated', staff, (tx) =>
      tx.query(`delete from email_suppressions`),
    );
    expect(staffDel.affectedRows).toBe(0);
    const adminDel = await as(db, 'authenticated', admin, (tx) =>
      tx.query(`delete from email_suppressions where email = 'a@x.test'`),
    );
    expect(adminDel.affectedRows).toBe(1);
    const { rows: c } = await as(db, 'authenticated', customer, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from email_suppressions`),
    );
    expect(c[0]!.n).toBe(0);
  });

  it('staff can read refund history but never write it', async () => {
    const { rows } = await as(db, 'authenticated', staff, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int n from refunds`),
    );
    expect(rows[0]!.n).toBe(0);
    await expect(
      as(db, 'authenticated', admin, (tx) => tx.query(`delete from refunds`)),
    ).rejects.toThrow(/permission denied/);
  });
});
