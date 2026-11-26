import type { OrderStatus } from '@extramile/core';
import { invokeAdminAction } from './adminActions';
import { outboxEnqueue } from './offline';
import { supabase } from './supabase';

export interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  email: string;
  created_at: string;
  /** 'online' (storefront) or 'walk_in' (counter sale). */
  channel: string;
}

export interface OrderItemRow {
  id: string;
  sku: string;
  title: string;
  qty: number;
  unit_price: number; // pesewas
  line_total: number; // pesewas, computed by the order RPC
  warranty_months: number;
  serials: string[];
}

/** The delivery address captured at checkout (orders.ship_to — an immutable snapshot). */
export interface ShipTo {
  recipient?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  landmark?: string;
}

export interface RefundRow {
  id: string;
  amount: number; // pesewas
  reason: string | null;
  status: string;
  created_at: string;
}

export interface OrderDetail extends OrderRow {
  phone: string;
  ship_to: ShipTo;
  zone: { name: string; eta_days_min: number; eta_days_max: number } | null;
  subtotal: number;
  shipping_fee: number;
  discount: number;
  coupon_code: string | null;
  notes: string | null;
  items: OrderItemRow[];
  refunds: RefundRow[];
  /** total minus everything refunded so far, in pesewas. */
  refundable: number;
}

const SELECT = 'id, order_number, status, payment_status, total, email, created_at, channel';
const DETAIL_SELECT = `${SELECT}, phone, ship_to, subtotal, shipping_fee, discount, coupon_code, notes, shipping_zones(name, eta_days_min, eta_days_max)`;

interface DetailJoin extends OrderRow {
  phone: string;
  ship_to: ShipTo | null;
  subtotal: number;
  shipping_fee: number;
  discount: number;
  coupon_code: string | null;
  notes: string | null;
  shipping_zones: { name: string; eta_days_min: number; eta_days_max: number } | null;
}

/** Find any order (not just open ones) by number, email or phone — e.g. to refund it. */
export async function searchOrders(q: string): Promise<OrderRow[]> {
  const term = q.trim().replace(/[%,()]/g, '');
  if (!term) return [];
  const { data } = await supabase
    .from('orders')
    .select(SELECT)
    .or(`order_number.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
    .order('created_at', { ascending: false })
    .limit(25)
    .returns<OrderRow[]>();
  return data ?? [];
}

/** Open orders staff act on (RLS lets staff read all). Cached for offline in D3. */
export async function listOpenOrders(): Promise<OrderRow[]> {
  const { data } = await supabase
    .from('orders')
    .select(SELECT)
    .in('status', ['confirmed', 'packed', 'dispatched'])
    .order('created_at', { ascending: true })
    .returns<OrderRow[]>();
  return data ?? [];
}

export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  const { data } = await supabase
    .from('orders')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .limit(1)
    .returns<DetailJoin[]>();
  const order = data?.[0];
  if (!order) return null;
  const [{ data: items }, { data: refunds }] = await Promise.all([
    supabase
      .from('order_items')
      .select('id, sku, title, qty, unit_price, line_total, warranty_months, serials')
      .eq('order_id', id)
      .returns<OrderItemRow[]>(),
    supabase
      .from('refunds')
      .select('id, amount, reason, status, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: true })
      .returns<RefundRow[]>(),
  ]);
  const { shipping_zones: zone, ship_to, ...rest } = order;
  const refunded = (refunds ?? []).reduce((n, r) => n + r.amount, 0);
  return {
    ...rest,
    ship_to: ship_to ?? {},
    zone,
    items: items ?? [],
    refunds: refunds ?? [],
    refundable: Math.max(order.total - refunded, 0),
  };
}

/**
 * Refund through admin-actions (admin only; the server checks the role, the amount
 * against what is left, calls Paystack and restocks a full refund unless `restock` is
 * false). `amountPesewas` null = everything still refundable. Online only — money must
 * never move from a queued replay the admin can no longer see.
 */
export async function refundOrder(
  orderId: string,
  amountPesewas: number | null,
  reason: string,
  restock: boolean,
): Promise<{ refundAmount: number; full: boolean }> {
  return invokeAdminAction<{ refundAmount: number; full: boolean }>('refund', {
    order_id: orderId,
    amount: amountPesewas,
    reason,
    restock,
  });
}

/** One line of the delivery address, skipping empty parts. */
export function formatAddress(s: ShipTo): string[] {
  return [
    s.recipient,
    [s.line1, s.line2].filter(Boolean).join(', '),
    s.landmark ? `Near ${s.landmark}` : '',
    [s.city, s.region].filter(Boolean).join(', '),
  ].filter((l): l is string => Boolean(l && l.trim()));
}

function key(): string {
  return globalThis.crypto.randomUUID();
}

/** Who/what last changed an order — shown when a transition is refused as stale (D-06). */
export interface OrderChange {
  status: string;
  updatedAt: string;
  by: string | null;
  source: string | null;
}

export async function getLastChange(orderId: string): Promise<OrderChange | null> {
  const [{ data: rows }, { data: logs }] = await Promise.all([
    supabase
      .from('orders')
      .select('status, updated_at')
      .eq('id', orderId)
      .limit(1)
      .returns<{ status: string; updated_at: string }[]>(),
    // Staff can read audit_log (migration 20261126000003). Web and desktop transitions both
    // go through admin-actions, which logs the order id in `after`.
    supabase
      .from('audit_log')
      .select('actor, source, created_at')
      .in('action', ['admin_actions.order_transition', 'admin_actions.refund'])
      .contains('after', { orderId })
      .order('created_at', { ascending: false })
      .limit(1)
      .returns<{ actor: string | null; source: string | null; created_at: string }[]>(),
  ]);
  const order = rows?.[0];
  if (!order) return null;
  const log = logs?.[0];
  let by: string | null = null;
  if (log?.actor) {
    const { data: p } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', log.actor)
      .limit(1)
      .returns<{ full_name: string | null }[]>();
    by = p?.[0]?.full_name ?? 'another staff member';
  }
  return { status: order.status, updatedAt: order.updated_at, by, source: log?.source ?? null };
}

/**
 * Move an order one step. Online → admin-actions `order_transition` (server checks the
 * move, audits it and emails the customer at dispatch/delivery). Offline → queued with the
 * same idempotency key the replay will use. `from` is the status on screen: if the order
 * changed meanwhile (e.g. refunded on the website) the server refuses instead of
 * overwriting it.
 */
export async function transitionOrder(
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
  online: boolean,
): Promise<void> {
  const idempotencyKey = key();
  if (online) {
    await invokeAdminAction('order_transition', { order_id: orderId, from, to }, idempotencyKey);
  } else {
    await outboxEnqueue('order_transition', { from, status: to }, idempotencyKey, orderId);
  }
}

export async function captureSerials(
  orderId: string,
  orderItemId: string,
  serials: string[],
  online: boolean,
): Promise<void> {
  if (online) {
    await saveSerials(orderItemId, serials);
  } else {
    await outboxEnqueue('serial_capture', { order_item_id: orderItemId, serials }, key(), orderId);
  }
}

/** Write serials and confirm a row actually changed — RLS refusals return no error. */
export async function saveSerials(orderItemId: string, serials: string[]): Promise<void> {
  const { data, error } = await supabase
    .from('order_items')
    .update({ serials })
    .eq('id', orderItemId)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Serials were not saved (no permission or item not found).');
}
