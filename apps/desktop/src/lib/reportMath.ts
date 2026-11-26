// Report arithmetic with no database access, so it is unit-tested in CI without env.
// All money is integer pesewas.

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
