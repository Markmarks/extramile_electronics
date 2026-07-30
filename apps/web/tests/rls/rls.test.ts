import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@extramile/core';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  createConfirmedUser,
  RLS_ENABLED,
  serviceClient,
  setRole,
  signInAs,
  uniqueEmail,
} from './helpers';

/**
 * Security — RLS (docs/04-TEST-PLAN.md §4, blocking gate).
 * Runs only with RUN_RLS=1 against a live local Supabase (CI `database` job, or
 * locally after `supabase start && supabase db reset`). Every assertion uses the
 * anon/authed client — never service_role — so the policies are actually exercised.
 */
describe.skipIf(!RLS_ENABLED)('RLS policies', () => {
  const svc = serviceClient();
  const anon = anonClient();

  let clientA: SupabaseClient<Database>;
  let clientB: SupabaseClient<Database>;
  let clientStaff: SupabaseClient<Database>;

  let aId: string;
  let aOrderId: string;
  let productId: string;
  let variantId: string;

  const orderNumber = () =>
    `EL-20260729-${Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .toUpperCase()
      .padStart(6, '0')}`;

  beforeAll(async () => {
    const aEmail = uniqueEmail('a');
    const bEmail = uniqueEmail('b');
    const staffEmail = uniqueEmail('staff');

    aId = await createConfirmedUser(aEmail);
    await createConfirmedUser(bEmail);
    const staffId = await createConfirmedUser(staffEmail);
    await setRole(staffId, 'staff');

    clientA = await signInAs(aEmail);
    clientB = await signInAs(bEmail);
    clientStaff = await signInAs(staffEmail);

    // seed references
    const { data: cat } = await svc.from('categories').select('id').limit(1).single();
    const { data: brand } = await svc.from('brands').select('id').limit(1).single();
    const { data: variant } = await svc
      .from('product_variants')
      .select('id, price, product_id')
      .limit(1)
      .single();
    if (!cat || !brand || !variant) throw new Error('seed data missing — run supabase db reset');
    variantId = variant.id;
    productId = variant.product_id;

    // inactive product for S-03
    await svc.from('products').insert({
      category_id: cat.id,
      brand_id: brand.id,
      title: 'Hidden Draft',
      slug: `hidden-${Date.now()}`,
      is_active: false,
    });

    // A's paid-looking order + item + payment for S-01/S-02
    const { data: order, error: oErr } = await svc
      .from('orders')
      .insert({
        order_number: orderNumber(),
        user_id: aId,
        email: 'a@rls.test',
        phone: '+233244000000',
        subtotal: variant.price,
        total: variant.price,
        ship_to: {},
      })
      .select('id')
      .single();
    if (oErr || !order) throw new Error(`seed order failed: ${oErr?.message}`);
    aOrderId = order.id;

    await svc.from('order_items').insert({
      order_id: aOrderId,
      variant_id: variantId,
      sku: 'SEED-SKU',
      title: 'Seed item',
      unit_price: variant.price,
      qty: 1,
      line_total: variant.price,
    });
    await svc
      .from('payments')
      .insert({ order_id: aOrderId, reference: `ref-${Date.now()}`, amount: variant.price });

    // A's address + wishlist for S-09
    await svc.from('addresses').insert({
      user_id: aId,
      recipient: 'A Tester',
      phone: '+233244000000',
      line1: '1 Test St',
      city: 'Accra',
      region: 'Greater Accra',
    });
    await svc.from('wishlist_items').insert({ user_id: aId, variant_id: variantId });
  });

  it('S-01: user B cannot read user A order', async () => {
    const { data: all } = await clientB.from('orders').select('*');
    expect((all ?? []).some((o) => o.id === aOrderId)).toBe(false);
    const { data: direct } = await clientB.from('orders').select('*').eq('id', aOrderId);
    expect(direct ?? []).toHaveLength(0);
  });

  it("S-02: user B cannot read A's order_items / payments", async () => {
    const { data: items } = await clientB.from('order_items').select('*').eq('order_id', aOrderId);
    expect(items ?? []).toHaveLength(0);
    const { data: pays } = await clientB.from('payments').select('*').eq('order_id', aOrderId);
    expect(pays ?? []).toHaveLength(0);
  });

  it('S-03: anon cannot read inactive products', async () => {
    const { data } = await anon.from('products').select('*').eq('is_active', false);
    expect(data ?? []).toHaveLength(0);
  });

  it('S-04: anon cannot read webhook_events / audit_log / refunds', async () => {
    for (const table of ['webhook_events', 'audit_log', 'refunds'] as const) {
      const { data, error } = await anon.from(table).select('*');
      expect((data ?? []).length === 0 || error !== null).toBe(true);
    }
  });

  it('S-05: user A cannot escalate their own role', async () => {
    const { error } = await clientA.from('profiles').update({ role: 'admin' }).eq('id', aId);
    expect(error).toBeTruthy();
    const { data } = await svc.from('profiles').select('role').eq('id', aId).single();
    expect(data?.role).toBe('customer');
  });

  it('S-06: user A cannot insert orders directly', async () => {
    const { error } = await clientA.from('orders').insert({
      order_number: orderNumber(),
      user_id: aId,
      email: 'a@rls.test',
      phone: '+233244000000',
      subtotal: 100,
      total: 100,
      ship_to: {},
    });
    expect(error).toBeTruthy();
  });

  it('S-07: user A cannot mutate their own order (no customer update policy)', async () => {
    const { data } = await clientA
      .from('orders')
      .update({ status: 'delivered' })
      .eq('id', aOrderId)
      .select();
    expect(data ?? []).toHaveLength(0); // 0 rows affected
    const { data: after } = await svc.from('orders').select('status').eq('id', aOrderId).single();
    expect(after?.status).toBe('pending');
  });

  it('S-08: user A cannot review without a delivered order', async () => {
    const { error } = await clientA
      .from('reviews')
      .insert({ product_id: productId, user_id: aId, rating: 5 });
    expect(error).toBeTruthy();
  });

  it("S-09: user B cannot read A's addresses / wishlist", async () => {
    const { data: addr } = await clientB.from('addresses').select('*');
    expect(addr ?? []).toHaveLength(0);
    const { data: wish } = await clientB.from('wishlist_items').select('*');
    expect(wish ?? []).toHaveLength(0);
  });

  it('S-10: staff can read all orders, customer cannot (RLS behind /admin)', async () => {
    // The middleware 404 for non-staff is covered by the E2E suite (P3).
    const { data: staffView } = await clientStaff.from('orders').select('id').eq('id', aOrderId);
    expect(staffView ?? []).toHaveLength(1);
    const { data: custView } = await clientB.from('orders').select('id').eq('id', aOrderId);
    expect(custView ?? []).toHaveLength(0);
  });

  it('S-12: anon sees zero rows on every private table (RLS enabled + restrictive)', async () => {
    // Behavioural proxy for relrowsecurity. If RLS were off, anon would read rows.
    // The authoritative pg_class check is scripts/check-rls.sql (launch checklist).
    const privateTables = [
      'profiles',
      'addresses',
      'carts',
      'cart_items',
      'orders',
      'order_items',
      'payments',
      'refunds',
      'coupons',
      'coupon_redemptions',
      'inventory_movements',
      'wishlist_items',
      'webhook_events',
      'audit_log',
      'staff_devices',
      'outbox_receipts',
    ] as const;
    for (const table of privateTables) {
      const { data } = await anon.from(table).select('*').limit(1);
      expect(data ?? []).toHaveLength(0);
    }
  });
});
