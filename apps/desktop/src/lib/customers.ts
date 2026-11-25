import { supabase } from './supabase';

/**
 * Customers and their order history (read-only; staff read profiles and orders through
 * RLS). Profiles hold no email — that lives in auth — so the email shown is the one on
 * the customer's latest order. Guest checkouts have no profile; find those with the
 * order search on the Orders screen.
 */
export interface CustomerRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  marketing_opt_in: boolean;
  created_at: string;
  orders: number;
  spent: number; // pesewas, paid orders only, before refunds
  email: string | null;
}

export interface CustomerOrder {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  email: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  marketing_opt_in: boolean;
  created_at: string;
}

const PAID = new Set(['paid', 'partially_refunded', 'refunded']);

export async function listCustomers(q = ''): Promise<CustomerRow[]> {
  let query = supabase
    .from('profiles')
    .select('id, full_name, phone, marketing_opt_in, created_at')
    .eq('role', 'customer')
    .order('created_at', { ascending: false })
    .limit(200);
  const term = q.trim().replace(/[%,()]/g, '');
  if (term) query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data: profiles } = await query.returns<ProfileRow[]>();
  const ids = (profiles ?? []).map((p) => p.id);
  if (!ids.length) return [];

  const { data: orders } = await supabase
    .from('orders')
    .select('user_id, total, payment_status, email, created_at')
    .in('user_id', ids)
    .order('created_at', { ascending: false })
    .returns<{ user_id: string; total: number; payment_status: string; email: string }[]>();

  const stats = new Map<string, { orders: number; spent: number; email: string | null }>();
  for (const o of orders ?? []) {
    const s = stats.get(o.user_id) ?? { orders: 0, spent: 0, email: o.email };
    s.orders += 1;
    if (PAID.has(o.payment_status)) s.spent += o.total;
    stats.set(o.user_id, s);
  }
  return (profiles ?? []).map((p) => ({
    ...p,
    orders: stats.get(p.id)?.orders ?? 0,
    spent: stats.get(p.id)?.spent ?? 0,
    email: stats.get(p.id)?.email ?? null,
  }));
}

export async function listCustomerOrders(userId: string): Promise<CustomerOrder[]> {
  const { data } = await supabase
    .from('orders')
    .select('id, order_number, status, payment_status, total, email, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<CustomerOrder[]>();
  return data ?? [];
}

// ── Email opt-outs (email_suppressions) ───────────────────────────────────────────
// Addresses the shop must not email: hard bounces, spam complaints, unsubscribes.
// Staff can read the list; only admins add or lift an entry (RLS).

export interface Suppression {
  email: string;
  reason: string | null;
  created_at: string;
}

export async function listSuppressions(): Promise<Suppression[]> {
  const { data } = await supabase
    .from('email_suppressions')
    .select('email, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
    .returns<Suppression[]>();
  return data ?? [];
}

export async function addSuppression(email: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from('email_suppressions')
    .insert({ email: email.trim().toLowerCase(), reason: reason.trim() || 'manual' });
  if (error) {
    if (/duplicate key/.test(error.message))
      throw new Error('That address is already on the list.');
    if (/row-level security/.test(error.message)) throw new Error('Only an admin can do that.');
    throw new Error(error.message);
  }
}

export async function removeSuppression(email: string): Promise<void> {
  const { data, error } = await supabase
    .from('email_suppressions')
    .delete()
    .eq('email', email)
    .select('email');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Not removed — only an admin can lift an opt-out.');
}
