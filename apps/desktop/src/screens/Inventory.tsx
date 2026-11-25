import { formatGHS } from '@extramile/core';
import { AlertTriangle, Banknote, Boxes, History, Layers, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState, PageHeader, StatCard } from '../components/ui';
import {
  listRecentMovements,
  listVariantStock,
  summarise,
  type Movement,
  type VariantStock,
} from '../lib/inventory';

const LOW_STOCK_THRESHOLD = 3;

export function Inventory() {
  const [rows, setRows] = useState<VariantStock[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  useEffect(() => {
    void (async () => {
      const [stock, moves] = await Promise.all([listVariantStock(), listRecentMovements()]);
      setRows(stock);
      setMovements(moves);
      setLoading(false);
    })();
  }, []);

  const summary = useMemo(() => summarise(rows), [rows]);
  const low = useMemo(() => rows.filter((v) => v.available < LOW_STOCK_THRESHOLD), [rows]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (lowOnly ? low : rows).filter(
      (v) => !q || v.sku.toLowerCase().includes(q) || v.title.toLowerCase().includes(q),
    );
  }, [rows, low, lowOnly, query]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Inventory" subtitle="Stock on hand, reservations and recent movements" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active SKUs" icon={Layers} value={loading ? '—' : summary.skuCount} />
        <StatCard label="Units on hand" icon={Boxes} value={loading ? '—' : summary.totalUnits} />
        <StatCard
          label="Retail value"
          icon={Banknote}
          tone="text-success"
          value={loading ? '—' : formatGHS(summary.retailValue)}
        />
        <StatCard
          label="Low stock"
          icon={AlertTriangle}
          tone={low.length ? 'text-warning' : 'text-muted-foreground'}
          value={loading ? '—' : low.length}
          hint={`Fewer than ${LOW_STOCK_THRESHOLD} available`}
        />
      </div>

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Stock levels</h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="accent-[hsl(var(--primary))]"
                checked={lowOnly}
                onChange={(e) => setLowOnly(e.target.checked)}
              />
              Low stock only
            </label>
            <div className="relative w-56">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                className="input pl-8"
                placeholder="Search SKU or product"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
        {loading ? (
          <p className="px-4 py-8 text-center text-muted-foreground">Loading inventory…</p>
        ) : shown.length === 0 ? (
          <EmptyState icon={Boxes} title="Nothing to show" body="No variants match this view." />
        ) : (
          <div className="max-h-[28rem] overflow-y-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">On hand</th>
                  <th className="text-right">Reserved</th>
                  <th className="text-right">Available</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => {
                  const isLow = v.available < LOW_STOCK_THRESHOLD;
                  return (
                    <tr key={v.id}>
                      <td className="font-mono text-xs">{v.sku}</td>
                      <td className="font-medium">{v.title}</td>
                      <td className="text-right tabular-nums text-muted-foreground">
                        {formatGHS(v.price)}
                      </td>
                      <td className="text-right tabular-nums">{v.stock}</td>
                      <td className="text-right tabular-nums text-muted-foreground">
                        {v.reserved}
                      </td>
                      <td className="text-right">
                        <span
                          className={`badge tabular-nums ${
                            v.available <= 0
                              ? 'bg-destructive/10 text-destructive'
                              : isLow
                                ? 'bg-warning/15 text-warning'
                                : 'bg-secondary text-foreground'
                          }`}
                        >
                          {v.available}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Recent movements</h2>
        </div>
        {movements.length === 0 ? (
          <EmptyState
            icon={History}
            title="No stock movements yet"
            body="Receipts, adjustments and sales will be logged here."
          />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>SKU</th>
                <th className="text-right">Change</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="text-muted-foreground">
                    {new Date(m.created_at).toLocaleString()}
                  </td>
                  <td className="font-mono text-xs">{m.sku ?? '—'}</td>
                  <td
                    className={`text-right font-medium tabular-nums ${
                      m.delta > 0 ? 'text-success' : 'text-destructive'
                    }`}
                  >
                    {m.delta > 0 ? '+' : ''}
                    {m.delta}
                  </td>
                  <td className="capitalize">{m.reason.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
