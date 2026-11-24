/**
 * Database wiring between storefront and back-office, tested against the real migrations
 * (supabase/migrations, applied in order to an in-process Postgres — see ./harness.ts).
 * Run: pnpm --filter @extramile/web test:db
 */
import type { PGlite } from '@electric-sql/pglite';
import { canTransition, type OrderStatus } from '@extramile/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createPendingOrder, createUser, freshDb, orderRow, variantCounts } from './harness';

const STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'packed',
  'dispatched',
  'delivered',
  'cancelled',
  'refunded',
  'oversold',
];

let db: PGlite;
let staff: string;
let customer: string;

beforeAll(async () => {
  db = await freshDb();
  staff = await createUser(db, 'staff');
  customer = await createUser(db, 'customer');
}, 120_000);

/** Move an order as the server (service_role), like admin-actions / the web server action. */
const setStatus = (orderId: string, to: OrderStatus) =>
  as(db, 'service_role', null, (tx) =>
    tx.query(`update orders set status = $1 where id = $2`, [to, orderId]),
  );

const markPaid = (orderId: string) =>
  as(db, 'service_role', null, (tx) => tx.query(`select commit_paid_order($1)`, [orderId]));

describe('order status rules (DB mirror of packages/core order-state)', () => {
  it('order_transition_allowed() matches canTransition() for every pair', async () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const { rows } = await db.query<{ ok: boolean }>(
          `select order_transition_allowed($1::order_status, $2::order_status) as ok`,
          [from, to],
        );
        expect(rows[0]!.ok, `${from} → ${to}`).toBe(canTransition(from, to));
      }
    }
  });

  it('the guard rejects an illegal move from any writer, including service_role', async () => {
    const { orderId } = await createPendingOrder(db);
    await expect(setStatus(orderId, 'delivered')).rejects.toThrow(
      /INVALID_TRANSITION: pending -> delivered/,
    );
    await markPaid(orderId);
    await setStatus(orderId, 'packed');
    await expect(setStatus(orderId, 'confirmed')).rejects.toThrow(/INVALID_TRANSITION/);
    expect((await orderRow(db, orderId)).status).toBe('packed');
  });

  it('a legal fulfilment chain goes through and bumps updated_at', async () => {
    const { orderId } = await createPendingOrder(db);
    await markPaid(orderId);
    const before = await db.query<{ u: string }>(
      `select updated_at::text u from orders where id = $1`,
      [orderId],
    );
    for (const to of ['packed', 'dispatched', 'delivered'] as const) await setStatus(orderId, to);
    const after = await db.query<{ u: string }>(
      `select updated_at::text u from orders where id = $1`,
      [orderId],
    );
    expect((await orderRow(db, orderId)).status).toBe('delivered');
    expect(after.rows[0]!.u >= before.rows[0]!.u).toBe(true);
  });

  it('a paid order cannot be cancelled — it must be refunded', async () => {
    const { orderId } = await createPendingOrder(db);
    await markPaid(orderId);
    await expect(setStatus(orderId, 'cancelled')).rejects.toThrow(/PAID_ORDER_NEEDS_REFUND/);
    await setStatus(orderId, 'refunded'); // the supported path
  });
});

describe('stock reservations stay consistent', () => {
  it('create_order holds stock; cancelling the unpaid order releases it exactly once', async () => {
    const { orderId, variantId } = await createPendingOrder(db, 2);
    const held = await variantCounts(db, variantId);
    await setStatus(orderId, 'cancelled');
    const after = await variantCounts(db, variantId);
    expect(after.reserved).toBe(held.reserved - 2);
    expect(after.stock).toBe(held.stock);
    expect((await orderRow(db, orderId)).reserved_until).toBeNull();
  });

  it('the expiry job cancels and releases once (no double release with the trigger)', async () => {
    const { orderId, variantId } = await createPendingOrder(db, 1);
    const held = await variantCounts(db, variantId);
    await db.query(`update orders set reserved_until = now() - interval '1 minute' where id = $1`, [
      orderId,
    ]);
    const { rows } = await as(db, 'service_role', null, (tx) =>
      tx.query<{ n: number }>(`select release_expired_reservations() as n`),
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(1);
    expect((await orderRow(db, orderId)).status).toBe('cancelled');
    expect((await variantCounts(db, variantId)).reserved).toBe(held.reserved - 1);
  });

  it('payment commits stock and converts the reservation', async () => {
    const { orderId, variantId } = await createPendingOrder(db, 1);
    const held = await variantCounts(db, variantId);
    await markPaid(orderId);
    const after = await variantCounts(db, variantId);
    expect(after.stock).toBe(held.stock - 1);
    expect(after.reserved).toBe(held.reserved - 1);
    expect(await orderRow(db, orderId)).toMatchObject({
      status: 'confirmed',
      payment_status: 'paid',
    });
  });

  it("a payment arriving after expiry confirms the order without stealing another order's reservation", async () => {
    const late = await createPendingOrder(db, 1);
    const other = await createPendingOrder(db, 1, undefined); // same first variant, still holding
    expect(other.variantId).toBe(late.variantId);
    await setStatus(late.orderId, 'cancelled'); // expired → released
    const before = await variantCounts(db, late.variantId);
    await markPaid(late.orderId);
    const after = await variantCounts(db, late.variantId);
    expect(await orderRow(db, late.orderId)).toMatchObject({
      status: 'confirmed',
      payment_status: 'paid',
    });
    expect(after.stock).toBe(before.stock - 1);
    expect(after.reserved).toBe(before.reserved); // `other` still holds its unit
  });

  it('only commit_paid_order may revive a cancelled order', async () => {
    const { orderId } = await createPendingOrder(db);
    await setStatus(orderId, 'cancelled');
    await expect(setStatus(orderId, 'confirmed')).rejects.toThrow(/INVALID_TRANSITION/);
  });
});

describe('API role permissions', () => {
  it('staff cannot change order status directly (must use admin-actions / server)', async () => {
    const { orderId } = await createPendingOrder(db);
    await expect(
      as(db, 'authenticated', staff, (tx) =>
        tx.query(`update orders set status = 'cancelled' where id = $1`, [orderId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('staff can record serials on an order item, but not change its price', async () => {
    const { orderId } = await createPendingOrder(db);
    const res = await as(db, 'authenticated', staff, (tx) =>
      tx.query(`update order_items set serials = '{356938035643809}' where order_id = $1`, [
        orderId,
      ]),
    );
    expect(res.affectedRows).toBe(1);
    await expect(
      as(db, 'authenticated', staff, (tx) =>
        tx.query(`update order_items set unit_price = 1 where order_id = $1`, [orderId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('a customer cannot record serials (RLS matches no rows)', async () => {
    const { orderId } = await createPendingOrder(db);
    const res = await as(db, 'authenticated', customer, (tx) =>
      tx.query(`update order_items set serials = '{1}' where order_id = $1`, [orderId]),
    );
    expect(res.affectedRows).toBe(0);
  });

  it('privileged RPCs are not callable from the browser roles', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(
        as(db, role, role === 'authenticated' ? staff : null, (tx) =>
          tx.query(`select commit_paid_order(gen_random_uuid())`),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        as(db, role, null, (tx) => tx.query(`select release_expired_reservations()`)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('anon can read the catalogue but not write it', async () => {
    const { rows } = await as(db, 'anon', null, (tx) =>
      tx.query(`select count(*)::int n from products`),
    );
    expect((rows[0] as { n: number }).n).toBeGreaterThan(0);
    await expect(
      as(db, 'anon', null, (tx) => tx.query(`update products set title = 'x'`)),
    ).rejects.toThrow(/permission denied/);
  });
});
