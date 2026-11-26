import { formatGHS } from '@extramile/core';
import {
  AlertTriangle,
  Banknote,
  Boxes,
  Download,
  FileUp,
  History,
  Layers,
  PackagePlus,
  Search,
  SlidersHorizontal,
  Tag,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CsvImport } from '../components/CsvImport';
import { cedisInputToPesewas, Field, Modal } from '../components/Modal';
import { saveCsv } from '../lib/exports';
import { EmptyState, Notice, PageHeader, StatCard } from '../components/ui';
import { useConnectivity } from '../hooks/useConnectivity';
import {
  ADJUST_REASONS,
  adjustStock,
  listRecentMovements,
  listVariantStock,
  receiveStock,
  summarise,
  type AdjustReason,
  type Movement,
  type VariantStock,
} from '../lib/inventory';
import { printLabel } from '../lib/print';
import { loadSettings } from '../lib/settings';

const LOW_STOCK_THRESHOLD = 3;

type Dialog = { kind: 'receive' | 'adjust' | 'label'; variant: VariantStock } | null;

export function Inventory() {
  const online = useConnectivity();
  const [rows, setRows] = useState<VariantStock[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    null,
  );

  const reload = useCallback(async () => {
    const [stock, moves] = await Promise.all([listVariantStock(), listRecentMovements()]);
    setRows(stock);
    setMovements(moves);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const summary = useMemo(() => summarise(rows), [rows]);
  const low = useMemo(() => rows.filter((v) => v.available < LOW_STOCK_THRESHOLD), [rows]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (lowOnly ? low : rows).filter(
      (v) => !q || v.sku.toLowerCase().includes(q) || v.title.toLowerCase().includes(q),
    );
  }, [rows, low, lowOnly, query]);

  async function done(text: string, tone: 'ok' | 'info' = 'ok') {
    setDialog(null);
    setImporting(false);
    setMessage({ tone, text });
    await reload();
  }

  /** Same columns the importer reads, so an export can be edited and re-imported. */
  async function exportStock() {
    try {
      const where = await saveCsv(`stock-${new Date().toISOString().slice(0, 10)}`, [
        ['sku', 'product', 'price', 'stock', 'reserved', 'available'],
        ...rows.map((v) => [
          v.sku,
          v.title,
          (v.price / 100).toFixed(2),
          v.stock,
          v.reserved,
          v.available,
        ]),
      ]);
      setMessage({ tone: 'ok', text: `Exported: ${where}` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Inventory"
        subtitle="Stock on hand, reservations and recent movements"
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => void exportStock()}>
              <Download className="size-3.5" aria-hidden /> Export CSV
            </button>
            <button type="button" className="btn-secondary" onClick={() => setImporting(true)}>
              <FileUp className="size-3.5" aria-hidden /> Import CSV
            </button>
          </>
        }
      />

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

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

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
                  <th className="w-[13rem]" />
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
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="btn-ghost h-7 px-2 text-xs"
                            onClick={() => setDialog({ kind: 'receive', variant: v })}
                            disabled={!online}
                            title={online ? 'Receive stock' : 'Receiving needs a connection'}
                          >
                            <PackagePlus className="size-3.5" aria-hidden /> Receive
                          </button>
                          <button
                            type="button"
                            className="btn-ghost h-7 px-2 text-xs"
                            onClick={() => setDialog({ kind: 'adjust', variant: v })}
                          >
                            <SlidersHorizontal className="size-3.5" aria-hidden /> Adjust
                          </button>
                          <button
                            type="button"
                            className="btn-ghost h-7 w-7 px-0"
                            aria-label={`Print label for ${v.sku}`}
                            title="Print barcode label"
                            onClick={() => setDialog({ kind: 'label', variant: v })}
                          >
                            <Tag className="size-3.5" aria-hidden />
                          </button>
                        </div>
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
                <th>Supplier · unit cost</th>
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
                  <td className="text-muted-foreground">
                    {[m.supplier, m.unit_cost !== null ? formatGHS(m.unit_cost) : null]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {importing && (
        <Modal
          title="Import prices / stock from CSV"
          wide
          onClose={() => {
            setImporting(false);
            void reload();
          }}
        >
          <CsvImport variants={rows} online={online} onDone={(s) => void done(s)} />
        </Modal>
      )}
      {dialog?.kind === 'receive' && (
        <Modal title={`Receive stock · ${dialog.variant.sku}`} onClose={() => setDialog(null)}>
          <ReceiveForm
            variant={dialog.variant}
            onDone={(qty) => void done(`Received ${qty} × ${dialog.variant.sku}.`)}
          />
        </Modal>
      )}
      {dialog?.kind === 'adjust' && (
        <Modal title={`Adjust stock · ${dialog.variant.sku}`} onClose={() => setDialog(null)}>
          <AdjustForm
            variant={dialog.variant}
            online={online}
            onDone={(r, delta) =>
              void done(
                r === 'queued'
                  ? `Adjustment ${delta > 0 ? '+' : ''}${delta} queued — will sync when online.`
                  : `Stock adjusted by ${delta > 0 ? '+' : ''}${delta}.`,
                r === 'queued' ? 'info' : 'ok',
              )
            }
          />
        </Modal>
      )}
      {dialog?.kind === 'label' && (
        <Modal title={`Barcode label · ${dialog.variant.sku}`} onClose={() => setDialog(null)}>
          <LabelForm variant={dialog.variant} onDone={(where) => void done(`Label ${where}.`)} />
        </Modal>
      )}
    </div>
  );
}

function ReceiveForm({
  variant,
  onDone,
}: {
  variant: VariantStock;
  onDone: (qty: number) => void;
}) {
  const [qty, setQty] = useState('1');
  const [cost, setCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1 || n > 10000) return setError('Enter 1 to 10,000 units.');
    const unitCost = cost.trim() ? cedisInputToPesewas(cost, true) : null;
    if (cost.trim() && unitCost === null) return setError('Unit cost must be an amount in cedis.');
    setBusy(true);
    setError(null);
    try {
      await receiveStock(variant.id, n, unitCost, supplier);
      onDone(n);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not receive stock.');
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-muted-foreground">
        {variant.title} — {variant.stock} on hand now.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Units received">
          <input
            className="input"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Unit cost (GH₵)" hint="What you paid per unit — for margin reports.">
          <input
            className="input"
            inputMode="decimal"
            placeholder="0.00"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Supplier">
        <input
          className="input"
          maxLength={120}
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
        />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy}>
          <PackagePlus className="size-3.5" aria-hidden /> {busy ? 'Saving…' : 'Receive'}
        </button>
      </div>
    </form>
  );
}

function AdjustForm({
  variant,
  online,
  onDone,
}: {
  variant: VariantStock;
  online: boolean;
  onDone: (r: 'applied' | 'queued', delta: number) => void;
}) {
  const [direction, setDirection] = useState<'remove' | 'add'>('remove');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState<AdjustReason | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(qty);
    if (!Number.isInteger(n) || n < 1) return setError('Enter a whole number of units.');
    if (!reason) return setError('Choose a reason — it is recorded on the stock log.');
    const delta = direction === 'add' ? n : -n;
    if (delta < 0 && variant.stock + delta < variant.reserved)
      return setError(`Only ${variant.available} can be removed — the rest are held for orders.`);
    setBusy(true);
    setError(null);
    try {
      onDone(await adjustStock(variant.id, delta, reason, online), delta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not adjust stock.');
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-muted-foreground">
        {variant.title} — {variant.stock} on hand, {variant.reserved} held for orders.
      </p>
      <div className="flex gap-2">
        {(['remove', 'add'] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={direction === d ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setDirection(d)}
          >
            {d === 'remove' ? 'Remove units' : 'Add units'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Units">
          <input
            className="input"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </Field>
        <Field label="Reason">
          <select
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value as AdjustReason)}
          >
            <option value="">Choose…</option>
            {ADJUST_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!online && (
        <Notice tone="info">Offline — this will be queued and applied when you reconnect.</Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save adjustment'}
        </button>
      </div>
    </form>
  );
}

function LabelForm({
  variant,
  onDone,
}: {
  variant: VariantStock;
  onDone: (where: string) => void;
}) {
  const [copies, setCopies] = useState(String(loadSettings().labelCopies));
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(copies);
    if (!Number.isInteger(n) || n < 1 || n > 20) return setError('1 to 20 labels.');
    try {
      onDone(await printLabel(variant.sku, variant.title, variant.price, n));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)}>
      <p className="text-muted-foreground">
        Code128 label for <span className="font-mono">{variant.sku}</span> · {variant.title} ·{' '}
        {formatGHS(variant.price)}
      </p>
      <Field label="Copies">
        <input
          className="input w-24"
          inputMode="numeric"
          value={copies}
          onChange={(e) => setCopies(e.target.value)}
        />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary">
          <Tag className="size-3.5" aria-hidden /> Print
        </button>
      </div>
    </form>
  );
}
