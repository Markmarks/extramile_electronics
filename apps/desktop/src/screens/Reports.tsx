import { formatGHS } from '@extramile/core';
import { BarChart3, Banknote, Download, Receipt, Store, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, Notice, PageHeader, StatCard } from '../components/ui';
import { saveCsv } from '../lib/exports';
import { listVariantStock, type VariantStock } from '../lib/inventory';
import { dayOf, latestCosts, loadReport, type Report } from '../lib/reports';

const today = () => dayOf(new Date().toISOString());
const daysAgo = (n: number) => dayOf(new Date(Date.now() - n * 86_400_000).toISOString());
/** Pesewas as a plain "1234.50" number for spreadsheets (never float-computed). */
const cedis = (p: number) =>
  `${p < 0 ? '-' : ''}${Math.floor(Math.abs(p) / 100)}.${String(Math.abs(p) % 100).padStart(2, '0')}`;

const PRESETS = [
  { label: 'Today', from: () => today() },
  { label: '7 days', from: () => daysAgo(6) },
  { label: '30 days', from: () => daysAgo(29) },
];

/** Daily/weekly sales, top SKUs, margin and stock valuation; CSV export (docs/07 §4). */
export function Reports() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<Report | null>(null);
  const [stock, setStock] = useState<VariantStock[]>([]);
  const [costs, setCosts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    const [r, s, c] = await Promise.all([
      loadReport(f, t).catch(() => null),
      listVariantStock().catch(() => []),
      latestCosts().catch(() => new Map<string, number>()),
    ]);
    setReport(r);
    setStock(s);
    setCosts(c);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(from, to);
    // Initial load only; later loads come from the filter buttons.
  }, []);

  const valuation = useMemo(() => {
    let retail = 0;
    let cost = 0;
    let costed = 0;
    for (const v of stock) {
      retail += v.stock * v.price;
      const c = costs.get(v.id);
      if (c !== undefined) {
        cost += v.stock * c;
        costed += 1;
      }
    }
    return { retail, cost, costed, total: stock.length };
  }, [stock, costs]);

  async function exportCsv(kind: 'sales' | 'skus' | 'stock') {
    if (!report) return;
    setMessage(null);
    try {
      let where: string;
      if (kind === 'sales') {
        where = await saveCsv(`sales-${from}-to-${to}`, [
          ['Day', 'Orders', 'Gross (GHS)', 'Refunds (GHS)', 'Net (GHS)'],
          ...report.days.map((d) => [
            d.day,
            d.orders,
            cedis(d.gross),
            cedis(d.refunds),
            cedis(d.net),
          ]),
        ]);
      } else if (kind === 'skus') {
        where = await saveCsv(`top-skus-${from}-to-${to}`, [
          ['SKU', 'Product', 'Units', 'Revenue (GHS)', 'Cost (GHS)', 'Margin (GHS)'],
          ...report.topSkus.map((s) => [
            s.sku,
            s.title,
            s.qty,
            cedis(s.revenue),
            s.cost === null ? '' : cedis(s.cost),
            s.margin === null ? '' : cedis(s.margin),
          ]),
        ]);
      } else {
        where = await saveCsv(`stock-valuation-${today()}`, [
          [
            'SKU',
            'Product',
            'On hand',
            'Reserved',
            'Price (GHS)',
            'Unit cost (GHS)',
            'Retail value (GHS)',
            'Cost value (GHS)',
          ],
          ...stock.map((v) => {
            const c = costs.get(v.id);
            return [
              v.sku,
              v.title,
              v.stock,
              v.reserved,
              cedis(v.price),
              c === undefined ? '' : cedis(c),
              cedis(v.stock * v.price),
              c === undefined ? '' : cedis(v.stock * c),
            ];
          }),
        ]);
      }
      setMessage({ tone: 'ok', text: `Exported: ${where}` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  }

  const t = report?.totals;
  const maxDay = Math.max(1, ...(report?.days ?? []).map((d) => d.net));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Reports" subtitle="Paid sales, best sellers, margin and stock value" />

      <form
        className="card flex flex-wrap items-end gap-3 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load(from, to);
        }}
      >
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn-secondary"
              onClick={() => {
                const f = p.from();
                setFrom(f);
                setTo(today());
                void load(f, today());
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="space-y-1">
          <span className="label">From</span>
          <input
            type="date"
            className="input"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="label">To</span>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary">
          Run
        </button>
      </form>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Net sales"
          icon={Banknote}
          tone="text-success"
          value={loading || !t ? '—' : formatGHS(t.net)}
          hint={t ? `${formatGHS(t.gross)} gross` : undefined}
        />
        <StatCard
          label="Paid orders"
          icon={Receipt}
          value={loading || !t ? '—' : t.orders}
          hint={t ? `Avg ${formatGHS(t.avgOrder)}` : undefined}
        />
        <StatCard
          label="Walk-in sales"
          icon={Store}
          value={loading || !t ? '—' : formatGHS(t.walkIn)}
          hint={t ? `${formatGHS(t.online)} online` : undefined}
        />
        <StatCard
          label="Refunds"
          icon={Undo2}
          tone={t?.refunds ? 'text-destructive' : 'text-muted-foreground'}
          value={loading || !t ? '—' : formatGHS(t.refunds)}
        />
      </div>

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Sales by day</h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void exportCsv('sales')}
            disabled={!report?.days.length}
          >
            <Download className="size-3.5" aria-hidden /> CSV
          </button>
        </div>
        {!report || report.days.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title={loading ? 'Loading…' : 'No paid sales in this period'}
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Day</th>
                <th className="w-1/3" />
                <th className="text-right">Orders</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Refunds</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {report.days.map((d) => (
                <tr key={d.day}>
                  <td className="whitespace-nowrap">
                    {new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </td>
                  <td>
                    <div
                      className="h-2 rounded-full bg-primary/70"
                      style={{ width: `${Math.max(2, (d.net / maxDay) * 100)}%` }}
                      aria-hidden
                    />
                  </td>
                  <td className="text-right tabular-nums">{d.orders}</td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {formatGHS(d.gross)}
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {d.refunds ? `−${formatGHS(d.refunds)}` : '—'}
                  </td>
                  <td className="text-right font-medium tabular-nums">{formatGHS(d.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Top SKUs</h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void exportCsv('skus')}
            disabled={!report?.topSkus.length}
          >
            <Download className="size-3.5" aria-hidden /> CSV
          </button>
        </div>
        {!report || report.topSkus.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title={loading ? 'Loading…' : 'Nothing sold in this period'}
          />
        ) : (
          <div className="max-h-[24rem] overflow-y-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {report.topSkus.slice(0, 50).map((s) => (
                  <tr key={s.sku}>
                    <td className="font-mono text-xs">{s.sku}</td>
                    <td className="font-medium">{s.title}</td>
                    <td className="text-right tabular-nums">{s.qty}</td>
                    <td className="text-right tabular-nums">{formatGHS(s.revenue)}</td>
                    <td
                      className={`text-right tabular-nums ${s.margin !== null && s.margin < 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                      title={
                        s.margin === null
                          ? 'No unit cost recorded — receive stock with a cost to see margin.'
                          : undefined
                      }
                    >
                      {s.margin === null ? '—' : formatGHS(s.margin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="card-title">Stock valuation (now)</h2>
            <p className="mt-1 text-muted-foreground">
              Retail {formatGHS(valuation.retail)} · at cost {formatGHS(valuation.cost)}{' '}
              <span className="text-xs">
                ({valuation.costed} of {valuation.total} SKUs have a recorded cost)
              </span>
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void exportCsv('stock')}
            disabled={!stock.length}
          >
            <Download className="size-3.5" aria-hidden /> CSV
          </button>
        </div>
      </section>
    </div>
  );
}
