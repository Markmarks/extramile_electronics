import { supabase } from './supabase';

// Read-only figures for the home screen. Staff read all orders under RLS (staff_orders).

export interface RecentOrder {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  email: string;
  created_at: string;
}

export interface DashboardData {
  salesToday: number; // pesewas, paid orders created today
  ordersToday: number;
  toFulfil: Record<'confirmed' | 'packed' | 'dispatched', number>;
  recent: RecentOrder[];
}

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function loadDashboard(): Promise<DashboardData> {
  const select = 'id, order_number, status, payment_status, total, email, created_at';
  const [today, open, recent] = await Promise.all([
    supabase
      .from('orders')
      .select('total, payment_status')
      .gte('created_at', startOfToday())
      .returns<{ total: number; payment_status: string }[]>(),
    supabase
      .from('orders')
      .select('status')
      .in('status', ['confirmed', 'packed', 'dispatched'])
      .returns<{ status: 'confirmed' | 'packed' | 'dispatched' }[]>(),
    supabase
      .from('orders')
      .select(select)
      .order('created_at', { ascending: false })
      .limit(8)
      .returns<RecentOrder[]>(),
  ]);

  const todays = today.data ?? [];
  const toFulfil = { confirmed: 0, packed: 0, dispatched: 0 };
  for (const o of open.data ?? []) toFulfil[o.status] += 1;

  return {
    salesToday: todays.filter((o) => o.payment_status === 'paid').reduce((s, o) => s + o.total, 0),
    ordersToday: todays.length,
    toFulfil,
    recent: recent.data ?? [],
  };
}
