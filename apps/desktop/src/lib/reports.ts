import { supabase } from './supabase';

// Sales, top SKUs, margin and stock valuation (docs/07 §4 Reports). Reads only — RLS lets
// staff read orders, items, refunds and movements. The arithmetic lives in buildReport()
// so it can be tested without a database. All money is integer pesewas.

export interface ReportOrder {
  id: string;
  total: number;
  created_at: string;
  channel: string;
  items: {
    sku: string;
    title: string;
    qty: number;
    line_total: number;
    variant_id: string | null;
  }[];
}
export interface ReportRefund {
  amount: number;
  created_at: string;
}
export interface DayRow {
  day: string; // yyyy-mm-dd (local)
  orders: number;
  gross: number;
  refunds: number;
  net: number;
}
export interface SkuRow {
  sku: string;
  title: string;
  qty: number;
  revenue: number;
  /** null when no receive cost is on record for this SKU. */
  cost: number | null;
  margin: number | null;
}
export interface Report {
  days: DayRow[];
  totals: {
    orders: number;
    gross: number;
    refunds: number;
    net: number;
    online: number;
    walkIn: number;
    avgOrder: number;
  };
  topSkus: SkuRow[];
}

const PAID = ['paid', 'partially_refunded', 'refunded'] as const;

/** Local calendar day of an ISO timestamp (the shop thinks in Accra days = UTC). */
export function dayOf(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Pure aggregation. `costs` = latest unit cost per variant id (pesewas). */
export function buildReport(
  orders: ReportOrder[],
  refunds: ReportRefund[],
  costs: Map<string, number>,
): Report {
  const days = new Map<string, DayRow>();
  const row = (day: string) => {
    let r = days.get(day);
    if (!r) {
      r = { day, orders: 0, gross: 0, refunds: 0, net: 0 };
      days.set(day, r);
    }
    return r;
  };
  let online = 0;
  let walkIn = 0;
  const skus = new Map<string, SkuRow & { costKnown: boolean }>();

  for (const o of orders) {
    const r = row(dayOf(o.created_at));
    r.orders += 1;
    r.gross += o.total;
    if (o.channel === 'walk_in') walkIn += o.total;
    else online += o.total;
    for (const it of o.items) {
      let s = skus.get(it.sku);
      if (!s) {
        s = {
          sku: it.sku,
          title: it.title,
          qty: 0,
          revenue: 0,
          cost: 0,
          margin: 0,
          costKnown: true,
        };
        skus.set(it.sku, s);
      }
      s.qty += it.qty;
      s.revenue += it.line_total;
      const unit = it.variant_id ? costs.get(it.variant_id) : undefined;
      if (unit === undefined) s.costKnown = false;
      else s.cost = (s.cost ?? 0) + unit * it.qty;
    }
  }
  for (const f of refunds) row(dayOf(f.created_at)).refunds += f.amount;

  const dayRows = [...days.values()]
    .map((d) => ({ ...d, net: d.gross - d.refunds }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const sum = (k: 'orders' | 'gross' | 'refunds') => dayRows.reduce((n, d) => n + d[k], 0);
  const count = sum('orders');
  const gross = sum('gross');

  return {
    days: dayRows,
    totals: {
      orders: count,
      gross,
      refunds: sum('refunds'),
      net: gross - sum('refunds'),
      online,
      walkIn,
      avgOrder: count ? Math.round(gross / count) : 0,
    },
    topSkus: [...skus.values()]
      .map(({ costKnown, ...s }) => ({
        ...s,
        cost: costKnown ? s.cost : null,
        margin: costKnown && s.cost !== null ? s.revenue - s.cost : null,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty),
  };
}

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
