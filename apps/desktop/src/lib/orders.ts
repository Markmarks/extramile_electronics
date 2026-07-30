import type { OrderStatus } from '@extramile/core';
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

/** Online → update directly; offline → queue in the outbox (replayed in order). */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  online: boolean,
): Promise<void> {
  if (online) {
    const { error } = await supabase.from('orders').update({ status: to }).eq('id', orderId);
    if (error) throw new Error(error.message);
  } else {
    await outboxEnqueue('order_transition', { status: to }, key(), orderId);
  }
}

export async function captureSerials(
  orderId: string,
  orderItemId: string,
  serials: string[],
  online: boolean,
): Promise<void> {
  if (online) {
    const { error } = await supabase.from('order_items').update({ serials }).eq('id', orderItemId);
    if (error) throw new Error(error.message);
  } else {
    await outboxEnqueue('serial_capture', { order_item_id: orderItemId, serials }, key(), orderId);
  }
}
