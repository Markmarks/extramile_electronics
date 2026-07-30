import 'server-only';

import type { Tables } from '@extramile/core';
import { createClient } from '@/lib/supabase/server';

export interface OrderSummary {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
}

export interface OrderItemView {
  sku: string;
  title: string;
  attrs: Record<string, unknown>;
  unitPrice: number;
  qty: number;
  lineTotal: number;
  warrantyMonths: number;
  serials: string[];
}

export interface OrderView {
  id: string;
  orderNumber: string;
  email: string;
  phone: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  shippingFee: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  couponCode: string | null;
  shipTo: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  items: OrderItemView[];
  payment: {
    reference: string;
    status: string;
    channel: string | null;
    paidAt: string | null;
  } | null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

export async function listUserOrders(): Promise<OrderSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('orders')
    .select('order_number, status, payment_status, total, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .returns<
      {
        order_number: string;
        status: string;
        payment_status: string;
        total: number;
        created_at: string;
      }[]
    >();
  return (data ?? []).map((o) => ({
    orderNumber: o.order_number,
    status: o.status,
    paymentStatus: o.payment_status,
    total: o.total,
    createdAt: o.created_at,
  }));
}

/** RLS ensures a user only sees their own order (staff see all). */
export async function getUserOrder(orderNumber: string): Promise<OrderView | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('order_number', orderNumber)
    .limit(1)
    .returns<Tables<'orders'>[]>();
  const order = orders?.[0];
  if (!order) return null;

  const [itemsRes, payRes] = await Promise.all([
    supabase
      .from('order_items')
      .select('sku, title, attrs, unit_price, qty, line_total, warranty_months, serials')
      .eq('order_id', order.id)
      .returns<
        {
          sku: string;
          title: string;
          attrs: unknown;
          unit_price: number;
          qty: number;
          line_total: number;
          warranty_months: number;
          serials: string[];
        }[]
      >(),
    supabase
      .from('payments')
      .select('reference, status, channel, paid_at')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .returns<
        { reference: string; status: string; channel: string | null; paid_at: string | null }[]
      >(),
  ]);

  const pay = payRes.data?.[0];
  return {
    id: order.id,
    orderNumber: order.order_number,
    email: order.email,
    phone: order.phone,
    status: order.status,
    paymentStatus: order.payment_status,
    subtotal: order.subtotal,
    shippingFee: order.shipping_fee,
    discount: order.discount,
    tax: order.tax,
    total: order.total,
    currency: order.currency,
    couponCode: order.coupon_code,
    shipTo: asRecord(order.ship_to),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: (itemsRes.data ?? []).map((i) => ({
      sku: i.sku,
      title: i.title,
      attrs: asRecord(i.attrs),
      unitPrice: i.unit_price,
      qty: i.qty,
      lineTotal: i.line_total,
      warrantyMonths: i.warranty_months,
      serials: i.serials,
    })),
    payment: pay
      ? { reference: pay.reference, status: pay.status, channel: pay.channel, paidAt: pay.paid_at }
      : null,
  };
}
