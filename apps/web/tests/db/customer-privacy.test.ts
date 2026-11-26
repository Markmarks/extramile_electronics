/**
 * Customer data rights + guest order claim (migration 20261126000002).
 * Run: pnpm --filter @extramile/web test:db
 */
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { as, createPendingOrder, createUser, freshDb } from './harness';

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
}, 120_000);

const emailOf = async (id: string) =>
  (await db.query<{ email: string }>(`select email from auth.users where id = $1`, [id])).rows[0]!
    .email;

async function guestOrder(email: string): Promise<string> {
  const { orderId } = await createPendingOrder(db);
  await db.query(`update orders set email = $1 where id = $2`, [email, orderId]);
  return orderId;
}

const ownerOf = async (orderId: string) =>
  (
    await db.query<{ user_id: string | null }>(`select user_id from orders where id = $1`, [
      orderId,
    ])
  ).rows[0]!.user_id;

describe('set_marketing_consent', () => {
  it('flips the profile flag and logs each change once', async () => {
    const user = await createUser(db, 'customer');
    const call = (granted: boolean) =>
      as(db, 'authenticated', user, (tx) =>
        tx.query(`select set_marketing_consent($1, 'web')`, [granted]),
      );
    await call(true);
    await call(true); // no change → no new log row
    await call(false);

    const { rows } = await db.query<{ granted: boolean }>(
      `select granted from consent_log where user_id = $1 order by id`,
      [user],
    );
    expect(rows.map((r) => r.granted)).toEqual([true, false]);
    const p = await db.query<{ m: boolean }>(
      `select marketing_opt_in as m from profiles where id = $1`,
      [user],
    );
    expect(p.rows[0]!.m).toBe(false);
  });

  it('anon cannot call it, and signed-in users cannot write consent_log directly', async () => {
    await expect(
      as(db, 'anon', null, (tx) => tx.query(`select set_marketing_consent(true)`)),
    ).rejects.toThrow(/permission denied/);
    const user = await createUser(db, 'customer');
    await expect(
      as(db, 'authenticated', user, (tx) =>
        tx.query(
          `insert into consent_log (user_id, kind, granted) values ($1, 'marketing_email', true)`,
          [user],
        ),
      ),
    ).rejects.toThrow(/permission denied|row-level security/);
  });

  it('a customer reads only their own consent history', async () => {
    const a = await createUser(db, 'customer');
    const b = await createUser(db, 'customer');
    await as(db, 'authenticated', a, (tx) => tx.query(`select set_marketing_consent(true)`));
    const { rows } = await as(db, 'authenticated', b, (tx) =>
      tx.query<{ n: number }>(`select count(*)::int as n from consent_log`),
    );
    expect(rows[0]!.n).toBe(0);
  });
});

describe('claim_guest_orders', () => {
  it('links guest orders with the same email (case/space-insensitive), not others', async () => {
    const user = await createUser(db, 'customer');
    const email = await emailOf(user);
    const mine = await guestOrder(`  ${email.toUpperCase()} `);
    const theirs = await guestOrder('someone.else@example.test');

    const n = await as(db, 'service_role', null, (tx) =>
      tx.query<{ n: number }>(`select claim_guest_orders($1, $2) as n`, [user, email]),
    );
    expect(n.rows[0]!.n).toBe(1);
    expect(await ownerOf(mine)).toBe(user);
    expect(await ownerOf(theirs)).toBeNull();
  });

  it('never moves an order that already belongs to another account', async () => {
    const owner = await createUser(db, 'customer');
    const other = await createUser(db, 'customer');
    const orderId = await guestOrder('shared@example.test');
    await db.query(`update orders set user_id = $1 where id = $2`, [owner, orderId]);
    await as(db, 'service_role', null, (tx) =>
      tx.query(`select claim_guest_orders($1, 'shared@example.test')`, [other]),
    );
    expect(await ownerOf(orderId)).toBe(owner);
  });

  it('is not callable by signed-in users or anon', async () => {
    const user = await createUser(db, 'customer');
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(
        as(db, role, role === 'anon' ? null : user, (tx) =>
          tx.query(`select claim_guest_orders($1, 'x@example.test')`, [user]),
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe('detach_customer + account deletion', () => {
  it('keeps orders but unlinks them, then the auth delete cascades the rest', async () => {
    const user = await createUser(db, 'customer');
    const orderId = await guestOrder(await emailOf(user));
    await db.query(`update orders set user_id = $1 where id = $2`, [user, orderId]);
    await db.query(
      `insert into addresses (user_id, recipient, phone, line1, city, region)
       values ($1, 'Ama', '+233244123456', '1 Oxford St', 'Accra', 'Greater Accra')`,
      [user],
    );
    await as(db, 'authenticated', user, (tx) => tx.query(`select set_marketing_consent(true)`));

    await as(db, 'service_role', null, (tx) => tx.query(`select detach_customer($1)`, [user]));
    await db.query(`delete from auth.users where id = $1`, [user]);

    expect(await ownerOf(orderId)).toBeNull();
    const left = await db.query<{ p: number; a: number; c: number; o: number }>(
      `select (select count(*)::int from profiles where id = $1) p,
              (select count(*)::int from addresses where user_id = $1) a,
              (select count(*)::int from consent_log where user_id = $1) c,
              (select count(*)::int from orders where id = $2) o`,
      [user, orderId],
    );
    expect(left.rows[0]).toEqual({ p: 0, a: 0, c: 0, o: 1 });
  });

  it('refuses staff and admin accounts', async () => {
    for (const role of ['staff', 'admin'] as const) {
      const user = await createUser(db, role);
      await expect(
        as(db, 'service_role', null, (tx) => tx.query(`select detach_customer($1)`, [user])),
      ).rejects.toThrow(/STAFF_ACCOUNT/);
    }
  });

  it('is not callable by signed-in users', async () => {
    const user = await createUser(db, 'customer');
    await expect(
      as(db, 'authenticated', user, (tx) => tx.query(`select detach_customer($1)`, [user])),
    ).rejects.toThrow(/permission denied/);
  });
});
