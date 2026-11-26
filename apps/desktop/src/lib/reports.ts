import { buildReport, type Report, type ReportOrder, type ReportRefund } from './reportMath';
import { supabase } from './supabase';

export * from './reportMath';

// Sales, top SKUs, margin and stock valuation (docs/07 §4 Reports). Reads only — RLS lets
// staff read orders, items, refunds and movements. The arithmetic is in reportMath.ts.

const PAID = ['paid', 'partially_refunded', 'refunded'] as const;

/** Latest receive cost per variant (from inventory_movements, migration 008 columns). */
export async function latestCosts(): Promise<Map<string, number>> {
  const { data } = await supabase
    .from('inventory_movements')
    .select('variant_id, unit_cost, created_at')
    .eq('reason', 'receive')
    .not('unit_cost', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5000)
    .returns<{ variant_id: string; unit_cost: number }[]>();
  const out = new Map<string, number>();
  for (const m of data ?? []) if (!out.has(m.variant_id)) out.set(m.variant_id, m.unit_cost);
  return out;
}

/** Paid orders + refunds between two local dates (inclusive). */
export async function loadReport(from: string, to: string): Promise<Report> {
  const start = new Date(`${from}T00:00:00`).toISOString();
  const end = new Date(`${to}T23:59:59.999`).toISOString();
  const [ordersRes, refundsRes, costs] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'id, total, created_at, channel, order_items(sku, title, qty, line_total, variant_id)',
      )
      .in('payment_status', PAID)
      .gte('created_at', start)
      .lte('created_at', end)
      .limit(10000)
      .returns<(Omit<ReportOrder, 'items'> & { order_items: ReportOrder['items'] })[]>(),
    supabase
      .from('refunds')
      .select('amount, created_at')
      .gte('created_at', start)
      .lte('created_at', end)
      .returns<ReportRefund[]>(),
    latestCosts(),
  ]);
  const orders = (ordersRes.data ?? []).map(({ order_items, ...o }) => ({
    ...o,
    items: order_items ?? [],
  }));
  return buildReport(orders, refundsRes.data ?? [], costs);
}
