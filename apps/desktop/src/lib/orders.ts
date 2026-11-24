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
}

export interface OrderItemRow {
  id: string;
  sku: string;
  title: string;
  qty: number;
  serials: string[];
}

export interface OrderDetail extends OrderRow {
  items: OrderItemRow[];
}

const SELECT = 'id, order_number, status, payment_status, total, email, created_at';

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
    .select(SELECT)
    .eq('id', id)
    .limit(1)
    .returns<OrderRow[]>();
  const order = data?.[0];
  if (!order) return null;
  const { data: items } = await supabase
    .from('order_items')
    .select('id, sku, title, qty, serials')
    .eq('order_id', id)
    .returns<OrderItemRow[]>();
  return { ...order, items: items ?? [] };
}

function key(): string {
  return globalThis.crypto.randomUUID();
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
