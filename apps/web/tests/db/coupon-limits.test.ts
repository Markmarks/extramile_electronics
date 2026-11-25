/**
 * Coupon per-customer limits (migration 20261125000004): commit_paid_order records every
 * redemption in coupon_redemptions, and create_order refuses with COUPON_LIMIT_REACHED
 * once the customer (signed-in user, or the order email for guests) has used the code
 * per_user_limit times. Only paid orders count.
 * Run: pnpm --filter @extramile/web test:db
 */
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, freshDb } from './harness';

let db: PGlite;
let zoneId: string;
let variantId: string;

beforeAll(async () => {
  db = await freshDb();
  zoneId = (
    await db.query<{ id: string }>(
      `insert into shipping_zones (name, base_fee) values ('Coupon test zone', 2000) returning id`,
    )
  ).rows[0]!.id;
  variantId = (
    await db.query<{ id: string }>(
      `update product_variants set stock = 1000
        where id = (select id from product_variants order by sku limit 1) returning id`,
    )
  ).rows[0]!.id;
}, 120_000);

let couponSeq = 0;
/** A fresh active percent coupon with no minimum spend. */
async function coupon(perUserLimit: number): Promise<string> {
  const code = `LIMIT${perUserLimit}-${++couponSeq}`;
  await db.query(
    `insert into coupons (code, kind, value, per_user_limit) values ($1, 'percent', 10, $2)`,
    [code, perUserLimit],
  );
  return code;
}

/** Checkout through create_order, as the storefront's server route does. */
async function checkout(code: string | null, email: string, userId: string | null = null) {
  const cartId = (
    await db.query<{ id: string }>(
      `insert into carts (token) values (gen_random_uuid()::text) returning id`,
    )
  ).rows[0]!.id;
  await db.query(
    `insert into cart_items (cart_id, variant_id, qty, added_price)
     select $1, id, 1, price from product_variants where id = $2`,
    [cartId, variantId],
  );
  return as(db, 'service_role', null, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `select (create_order($1, $2, '+233244123456', '{}'::jsonb, $3, $4, $5)).id`,
      [cartId, email, zoneId, code, userId],
    );
    return rows[0]!.id;
  });
}

const pay = (orderId: string) =>
  as(db, 'service_role', null, (tx) => tx.query(`select commit_paid_order($1)`, [orderId]));

async function checkoutAndPay(code: string, email: string, userId: string | null = null) {
  const orderId = await checkout(code, email, userId);
  await pay(orderId);
  return orderId;
}

const redemptions = async (code: string) =>
  (
    await db.query<{ user_id: string | null; email: string | null; order_id: string }>(
      `select r.user_id, r.email, r.order_id
         from coupon_redemptions r join coupons c on c.id = r.coupon_id
        where c.code = $1 order by r.id`,
      [code],
    )
  ).rows;

describe('recording redemptions', () => {
  it('a paid order with a coupon writes one coupon_redemptions row (and only once)', async () => {
    const code = await coupon(5);
    const user = await createUser(db, 'customer');
    const orderId = await checkoutAndPay(code, '  Ama.Mensah@Example.TEST ', user);
    await pay(orderId); // webhook retry — idempotent

    expect(await redemptions(code)).toEqual([
      { user_id: user, email: 'ama.mensah@example.test', order_id: orderId },
    ]);
    const { rows } = await db.query<{ redemption_count: number }>(
      `select redemption_count from coupons where code = $1`,
      [code],
    );
    expect(rows[0]!.redemption_count).toBe(1);
  });

  it('an unpaid order records nothing and does not use up the allowance', async () => {
    const code = await coupon(1);
    const user = await createUser(db, 'customer');
    await checkout(code, 'kofi@example.test', user); // abandoned at the payment step
    expect(await redemptions(code)).toEqual([]);
    await expect(checkoutAndPay(code, 'kofi@example.test', user)).resolves.toBeTruthy();
  });
});

describe('enforcing per_user_limit', () => {
  it('a signed-in customer cannot reuse a once-per-customer code', async () => {
    const code = await coupon(1);
    const user = await createUser(db, 'customer');
    await checkoutAndPay(code, 'yaw@example.test', user);
    await expect(checkout(code, 'yaw.other@example.test', user)).rejects.toThrow(
      /COUPON_LIMIT_REACHED/,
    );
  });

  it('per_user_limit = 2 allows two paid uses, refuses the third', async () => {
    const code = await coupon(2);
    const user = await createUser(db, 'customer');
    await checkoutAndPay(code, 'esi@example.test', user);
    await checkoutAndPay(code, 'esi@example.test', user);
    await expect(checkout(code, 'esi@example.test', user)).rejects.toThrow(/COUPON_LIMIT_REACHED/);
  });

  it("one customer's uses do not count against another", async () => {
    const code = await coupon(1);
    const a = await createUser(db, 'customer');
    const b = await createUser(db, 'customer');
    await checkoutAndPay(code, 'a@example.test', a);
    await expect(checkoutAndPay(code, 'b@example.test', b)).resolves.toBeTruthy();
  });

  it('guests are limited by order email (case and spaces ignored)', async () => {
    const code = await coupon(1);
    await checkoutAndPay(code, 'guest@example.test');
    await expect(checkout(code, ' GUEST@example.test')).rejects.toThrow(/COUPON_LIMIT_REACHED/);
    await expect(checkoutAndPay(code, 'someone.else@example.test')).resolves.toBeTruthy();
  });

  it('signing in does not reset a guest allowance for the same email, nor vice versa', async () => {
    const code = await coupon(1);
    const user = await createUser(db, 'customer');
    await checkoutAndPay(code, 'adwoa@example.test'); // as a guest
    await expect(checkout(code, 'adwoa@example.test', user)).rejects.toThrow(
      /COUPON_LIMIT_REACHED/,
    );

    const code2 = await coupon(1);
    await checkoutAndPay(code2, 'adwoa@example.test', user); // signed in
    await expect(checkout(code2, 'adwoa@example.test')).rejects.toThrow(/COUPON_LIMIT_REACHED/);
  });

  it('a refused checkout writes no order and holds no stock', async () => {
    const code = await coupon(1);
    const user = await createUser(db, 'customer');
    await checkoutAndPay(code, 'nana@example.test', user);
    const before = await db.query<{ n: number; reserved: number }>(
      `select (select count(*)::int from orders) as n,
              (select reserved from product_variants where id = $1) as reserved`,
      [variantId],
    );
    await expect(checkout(code, 'nana@example.test', user)).rejects.toThrow(/COUPON_LIMIT_REACHED/);
    const after = await db.query<{ n: number; reserved: number }>(
      `select (select count(*)::int from orders) as n,
              (select reserved from product_variants where id = $1) as reserved`,
      [variantId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('checking out without a coupon is unaffected by past coupon use', async () => {
    const code = await coupon(1);
    const user = await createUser(db, 'customer');
    await checkoutAndPay(code, 'kwame@example.test', user);
    await expect(checkout(null, 'kwame@example.test', user)).resolves.toBeTruthy();
  });
});

describe('who can see redemptions', () => {
  it('customers cannot read coupon_redemptions', async () => {
    const user = await createUser(db, 'customer');
    const read = as(db, 'authenticated', user, (tx) =>
      tx.query(`select count(*)::int as n from coupon_redemptions`),
    );
    // Either no grant (permission denied) or RLS hides every row.
    await read.then(
      (r) => expect((r.rows[0] as { n: number }).n).toBe(0),
      (e: Error) => expect(e.message).toMatch(/permission denied/),
    );
  });
});
