import { formatGHS } from '@extramile/core';
import {
  Banknote,
  Minus,
  Plus,
  Printer,
  ScanLine,
  Smartphone,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Field } from '../components/Modal';
import { EmptyState, Notice, PageHeader } from '../components/ui';
import { useConnectivity } from '../hooks/useConnectivity';
import { listVariantStock, type VariantStock } from '../lib/inventory';
import { getOrderDetail } from '../lib/orders';
import { printReceipt } from '../lib/print';
import {
  cleanSerials,
  forgetSyncedSale,
  listSyncedSales,
  recordSale,
  saleTotal,
  type PayMethod,
  type SaleLine,
  type SyncedSale,
} from '../lib/walkIn';
import { buildReceipt } from '../lib/receipt';

/**
 * Counter sale: scan or search items, take cash / MoMo, record, print. Works offline —
 * the sale is queued and gets its real order number when the PC reconnects.
 */
export function WalkIn() {
  const online = useConnectivity();
  const [stock, setStock] = useState<VariantStock[]>([]);
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<(SaleLine & { serialText: string })[]>([]);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [synced, setSynced] = useState<SyncedSale[]>(listSyncedSales);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listVariantStock()
      .then(setStock)
      .catch(() => setStock([]));
    const t = setInterval(() => setSynced(listSyncedSales()), 5000);
    return () => clearInterval(t);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return stock
      .filter((v) => v.sku.toLowerCase().includes(q) || v.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [stock, query]);

  function add(v: VariantStock) {
    setMessage(null);
    setLines((cur) => {
      const i = cur.findIndex((l) => l.variantId === v.id);
      if (i >= 0) {
        const next = [...cur];
        next[i] = { ...next[i]!, qty: Math.min(next[i]!.qty + 1, 100) };
        return next;
      }
      return [
        ...cur,
        {
          variantId: v.id,
          sku: v.sku,
          title: v.title,
          price: v.price,
          qty: 1,
          serials: [],
          serialText: '',
        },
      ];
    });
    setQuery('');
    searchRef.current?.focus();
  }

  /** A barcode scanner types the SKU and presses Enter: add the exact match. */
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const exact = stock.find((v) => v.sku.toLowerCase() === query.trim().toLowerCase());
    const pick = exact ?? (matches.length === 1 ? matches[0] : undefined);
    if (pick) add(pick);
    else setMessage({ tone: 'error', text: `No single item matches “${query.trim()}”.` });
  }

  const setLine = (i: number, patch: Partial<SaleLine & { serialText: string }>) =>
    setLines((cur) => cur.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const total = saleTotal(lines);
  const short = lines.find((l) => {
    const v = stock.find((s) => s.id === l.variantId);
    return v ? l.qty > v.available : false;
  });

  async function submit() {
    if (!lines.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await recordSale(
        {
          lines: lines.map((l) => ({ ...l, serials: cleanSerials(l.serialText, l.qty) })),
          method,
          customer,
          phone,
          email,
        },
        online,
      );
      if (r.kind === 'recorded') {
        setLastOrderId(r.orderId);
        setMessage({
          tone: 'ok',
          text: `Sale ${r.orderNumber} recorded — ${formatGHS(r.total)} paid by ${method === 'cash' ? 'cash' : 'MoMo'}.`,
        });
        void listVariantStock().then(setStock);
      } else {
        setLastOrderId(null);
        setMessage({
          tone: 'info',
          text: `Offline: sale ${r.localRef} queued. It gets its order number when this PC reconnects — reprint the receipt then.`,
        });
      }
      setLines([]);
      setCustomer('');
      setPhone('');
      setEmail('');
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Sale failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function reprint(orderId: string) {
    try {
      const detail = await getOrderDetail(orderId);
      if (!detail) throw new Error('Order not found.');
      const where = await printReceipt(buildReceipt(detail));
      setMessage({ tone: 'ok', text: `Receipt ${where}.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Walk-in sale"
        subtitle={
          online
            ? 'Scan or search items, take payment, print the receipt'
            : 'Offline — sales will queue and sync later'
        }
      />

      {synced.length > 0 && (
        <div className="space-y-1">
          {synced.map((s) => (
            <Notice key={s.localRef} tone="info">
              Offline sale {s.localRef} is now <strong>{s.orderNumber}</strong>.{' '}
              <button
                type="button"
                className="font-medium text-primary underline"
                onClick={() => void reprint(s.orderId)}
              >
                Reprint receipt
              </button>{' '}
              <button
                type="button"
                className="text-muted-foreground underline"
                onClick={() => {
                  forgetSyncedSale(s.localRef);
                  setSynced(listSyncedSales());
                }}
              >
                Dismiss
              </button>
            </Notice>
          ))}
        </div>
      )}

      {/* Side-by-side only when the content area is wide enough (sidebar takes 14rem). */}
      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <section className="card overflow-visible">
          <div className="relative border-b p-3">
            <ScanLine
              className="pointer-events-none absolute left-5.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              ref={searchRef}
              className="input h-10 pl-9 text-[15px]"
              placeholder="Scan a barcode or type a SKU / product name"
              aria-label="Add item"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
            />
            {matches.length > 0 && (
              <ul className="absolute left-3 right-3 top-full z-10 mt-1 divide-y rounded-lg border bg-card shadow-lg">
                {matches.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-secondary/50 disabled:opacity-50"
                      disabled={v.available <= 0}
                      onClick={() => add(v)}
                    >
                      <span>
                        <span className="font-medium">{v.title}</span>{' '}
                        <span className="font-mono text-[11px] text-muted-foreground">{v.sku}</span>
                      </span>
                      <span className="text-right text-[13px] tabular-nums">
                        {formatGHS(v.price)}
                        <span className="block text-[11px] text-muted-foreground">
                          {v.available > 0 ? `${v.available} available` : 'Out of stock'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lines.length === 0 ? (
            <EmptyState
              icon={Store}
              title="No items yet"
              body="Scan a product barcode to add it to the sale."
            />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="w-32 text-center">Qty</th>
                  <th>IMEI / serials</th>
                  <th className="text-right">Line</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.variantId}>
                    <td className="min-w-[9rem]">
                      <p className="font-medium">{l.title}</p>
                      <p className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                        {l.sku}
                      </p>
                      <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                        {formatGHS(l.price)} each
                      </p>
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          className="btn-ghost h-7 w-7 px-0"
                          aria-label="One fewer"
                          onClick={() => setLine(i, { qty: Math.max(1, l.qty - 1) })}
                        >
                          <Minus className="size-3.5" aria-hidden />
                        </button>
                        <span className="w-8 text-center tabular-nums">{l.qty}</span>
                        <button
                          type="button"
                          className="btn-ghost h-7 w-7 px-0"
                          aria-label="One more"
                          onClick={() => setLine(i, { qty: Math.min(100, l.qty + 1) })}
                        >
                          <Plus className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </td>
                    <td>
                      <input
                        className="input font-mono text-xs"
                        placeholder={
                          l.qty > 1 ? `Up to ${l.qty}, comma separated` : 'Scan IMEI (optional)'
                        }
                        value={l.serialText}
                        onChange={(e) => setLine(i, { serialText: e.target.value })}
                      />
                    </td>
                    <td className="whitespace-nowrap text-right font-medium tabular-nums">
                      {formatGHS(l.price * l.qty)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-ghost h-7 w-7 px-0"
                        aria-label={`Remove ${l.sku}`}
                        onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <aside className="card space-y-4 self-start p-4">
          <div>
            <p className="text-xs text-muted-foreground">Total to collect</p>
            <p className="text-3xl font-semibold tabular-nums">{formatGHS(total)}</p>
            <p className="text-[11px] text-muted-foreground">
              Final total is confirmed by the server from current prices.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['cash', 'Cash', Banknote],
                ['momo', 'MoMo', Smartphone],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                className={method === m ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setMethod(m)}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>

          <Field label="Customer name (optional)">
            <input
              className="input"
              maxLength={120}
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            />
          </Field>
          <Field label="Phone (optional)">
            <input
              className="input"
              inputMode="tel"
              maxLength={20}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field label="Email for receipt (optional)">
            <input
              className="input"
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          {short && (
            <Notice tone="error">
              Only {stock.find((s) => s.id === short.variantId)?.available ?? 0} of {short.sku}{' '}
              available.
            </Notice>
          )}

          <button
            type="button"
            className="btn-primary btn-lg w-full"
            disabled={busy || !lines.length || !!short}
            onClick={() => void submit()}
          >
            {busy ? 'Recording…' : `Record ${method === 'cash' ? 'cash' : 'MoMo'} sale`}
          </button>
          {lines.length > 0 && (
            <button type="button" className="btn-ghost w-full" onClick={() => setLines([])}>
              <X className="size-3.5" aria-hidden /> Clear sale
            </button>
          )}

          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          {lastOrderId && (
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => void reprint(lastOrderId)}
            >
              <Printer className="size-4" aria-hidden /> Print receipt
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
