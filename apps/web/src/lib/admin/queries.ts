import 'server-only';

import type { OrderStatus } from '@extramile/core';
import { createAdminClient } from '@/lib/supabase/admin';

export interface DashboardStats {
  todaysOrders: number;
  todaysRevenue: number;
  pendingPayments: number;
  oversold: number;
  lowStock: { sku: string; available: number }[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const admin = createAdminClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const iso = startOfDay.toISOString();

  const [ordersToday, paidToday, pending, oversold, variants] = await Promise.all([
    admin.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', iso),
    admin
      .from('orders')
      .select('total')
      .eq('payment_status', 'paid')
      .gte('created_at', iso)
      .returns<{ total: number }[]>(),
    admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .in('payment_status', ['unpaid', 'processing']),
    admin.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'oversold'),
    admin
      .from('product_variants')
      .select('sku, stock, reserved')
      .eq('is_active', true)
      .returns<{ sku: string; stock: number; reserved: number }[]>(),
  ]);

  const todaysRevenue = (paidToday.data ?? []).reduce((sum, o) => sum + o.total, 0);
  const lowStock = (variants.data ?? [])
    .map((v) => ({ sku: v.sku, available: v.stock - v.reserved }))
    .filter((v) => v.available < 3)
    .sort((a, b) => a.available - b.available)
    .slice(0, 10);

  return {
    todaysOrders: ordersToday.count ?? 0,
    todaysRevenue,
    pendingPayments: pending.count ?? 0,
    oversold: oversold.count ?? 0,
    lowStock,
  };
}

export interface AdminOrderRow {
  orderNumber: string;
  email: string;
  status: string;
  paymentStatus: string;
  total: number;
  createdAt: string;
}

export async function listAdminOrders(status?: string): Promise<AdminOrderRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from('orders')
    .select('order_number, email, status, payment_status, total, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (status) query = query.eq('status', status as OrderStatus);

  const { data } = await query.returns<
    {
      order_number: string;
      email: string;
      status: string;
      payment_status: string;
      total: number;
      created_at: string;
    }[]
  >();
  return (data ?? []).map((o) => ({
    orderNumber: o.order_number,
    email: o.email,
    status: o.status,
    paymentStatus: o.payment_status,
    total: o.total,
    createdAt: o.created_at,
  }));
}
