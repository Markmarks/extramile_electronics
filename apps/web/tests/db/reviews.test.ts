/**
 * Customer reviews (migration 20261125000003 on top of 006's write_review / pub_read_rev):
 * only a buyer with a delivered order may review; the database, not the caller, decides
 * order_id / is_verified_purchase; nothing is public until staff publish it.
 * Run: pnpm --filter @extramile/web test:db
 */
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createPendingOrder, createUser, freshDb } from './harness';

let db: PGlite;
let buyer: string;
let stranger: string;
let productId: string;
let deliveredOrder: string;

const productOf = async (variantId: string) =>
  (
    await db.query<{ product_id: string }>(
      `select product_id from product_variants where id = $1`,
      [variantId],
    )
  ).rows[0]!.product_id;

/** An order for `userId`, moved through to `delivered` the way the server does it. */
async function deliveredOrderFor(userId: string): Promise<{ orderId: string; variantId: string }> {
  const { orderId, variantId } = await createPendingOrder(db);
  await db.query(`update orders set user_id = $1 where id = $2`, [userId, orderId]);
  await as(db, 'service_role', null, async (tx) => {
    await tx.query(`select commit_paid_order($1)`, [orderId]);
    for (const to of ['packed', 'dispatched', 'delivered'])
      await tx.query(`update orders set status = $1 where id = $2`, [to, orderId]);
  });
  return { orderId, variantId };
}

const insertReview = (userId: string, sql: string, params: unknown[]) =>
  as(db, 'authenticated', userId, (tx: Transaction) => tx.query(sql, params));

beforeAll(async () => {
  db = await freshDb();
  buyer = await createUser(db, 'customer');
  stranger = await createUser(db, 'customer');
  const o = await deliveredOrderFor(buyer);
  deliveredOrder = o.orderId;
  productId = await productOf(o.variantId);
}, 120_000);

describe('writing a review', () => {
  it('a customer without a delivered order for the product cannot review it', async () => {
    await expect(
      insertReview(
        stranger,
        `insert into reviews (product_id, user_id, rating, title, body) values ($1, $2, 5, 't', 'b')`,
        [productId, stranger],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('an undelivered order is not enough', async () => {
    const pending = await createUser(db, 'customer');
    const { orderId, variantId } = await createPendingOrder(db);
    await db.query(`update orders set user_id = $1 where id = $2`, [pending, orderId]);
    await expect(
      insertReview(
        pending,
        `insert into reviews (product_id, user_id, rating) values ($1, $2, 4)`,
        [await productOf(variantId), pending],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('nobody can review on behalf of someone else', async () => {
    await expect(
      insertReview(
        stranger,
        `insert into reviews (product_id, user_id, rating) values ($1, $2, 5)`,
        [productId, buyer],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it.each([
    ['is_published', 'true'],
    ['is_verified_purchase', 'true'],
    ['order_id', 'gen_random_uuid()'],
  ])('the customer cannot set %s themselves', async (column, value) => {
    await expect(
      insertReview(
        buyer,
        `insert into reviews (product_id, user_id, rating, ${column}) values ($1, $2, 5, ${value})`,
        [productId, buyer],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a delivered buyer can review; it is unpublished, verified and tied to their order', async () => {
    await insertReview(
      buyer,
      `insert into reviews (product_id, user_id, rating, title, body) values ($1, $2, 4, 'Solid', 'Does the job well.')`,
      [productId, buyer],
    );
    const { rows } = await db.query<{
      is_published: boolean;
      is_verified_purchase: boolean;
      order_id: string;
    }>(
      `select is_published, is_verified_purchase, order_id from reviews where user_id = $1 and product_id = $2`,
      [buyer, productId],
    );
    expect(rows).toEqual([
      { is_published: false, is_verified_purchase: true, order_id: deliveredOrder },
    ]);
  });

  it('one review per product per customer', async () => {
    await expect(
      insertReview(buyer, `insert into reviews (product_id, user_id, rating) values ($1, $2, 1)`, [
        productId,
        buyer,
      ]),
    ).rejects.toThrow(/duplicate key/);
  });

  it('title and body have length limits', async () => {
    const other = await createUser(db, 'customer');
    const o = await deliveredOrderFor(other);
    const pid = await productOf(o.variantId);
    await expect(
      insertReview(
        other,
        `insert into reviews (product_id, user_id, rating, title) values ($1, $2, 5, repeat('x', 121))`,
        [pid, other],
      ),
    ).rejects.toThrow(/reviews_title_check/);
    await expect(
      insertReview(
        other,
        `insert into reviews (product_id, user_id, rating, body) values ($1, $2, 5, repeat('x', 4001))`,
        [pid, other],
      ),
    ).rejects.toThrow(/reviews_body_check/);
  });

  it('customers cannot edit or delete a review (moderation is staff-only)', async () => {
    const changed = await as(db, 'authenticated', buyer, async (tx) => {
      const del = await tx.query(`delete from reviews where user_id = $1`, [buyer]);
      return del.affectedRows ?? 0;
    });
    expect(changed).toBe(0);
    // No update policy for customers: denied outright once 20261125000002 narrows the grant,
    // matches no rows before that. Either way the review is unchanged.
    await as(db, 'authenticated', buyer, (tx) =>
      tx.query(`update reviews set rating = 5, is_published = true where user_id = $1`, [buyer]),
    ).catch(() => undefined);
    const { rows } = await db.query<{ rating: number; is_published: boolean }>(
      `select rating, is_published from reviews where user_id = $1`,
      [buyer],
    );
    expect(rows).toEqual([{ rating: 4, is_published: false }]);
  });
});

describe('reading reviews', () => {
  const visible = (role: 'anon' | 'authenticated', userId: string | null) =>
    as(db, role, userId, async (tx) => {
      const { rows } = await tx.query<{ n: number }>(
        `select count(*)::int n from reviews where product_id = $1`,
        [productId],
      );
      return rows[0]!.n;
    });

  it('an unpublished review is visible to its author only', async () => {
    expect(await visible('authenticated', buyer)).toBe(1);
    expect(await visible('authenticated', stranger)).toBe(0);
    expect(await visible('anon', null)).toBe(0);
  });

  it('once published (by the server / staff), everyone can read it', async () => {
    await as(db, 'service_role', null, (tx) =>
      tx.query(`update reviews set is_published = true where user_id = $1`, [buyer]),
    );
    expect(await visible('anon', null)).toBe(1);
    expect(await visible('authenticated', stranger)).toBe(1);
  });
});
