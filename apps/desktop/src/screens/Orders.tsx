import { formatGHS, type OrderStatus } from '@extramile/core';
import { Check, Inbox, Printer, RefreshCw, ScanLine, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SerialCapture } from '../components/SerialCapture';
import { EmptyState, Notice, PageHeader, StatusBadge } from '../components/ui';
import { useConnectivity } from '../hooks/useConnectivity';
import {
  captureSerials,
  getOrderDetail,
  listOpenOrders,
  transitionOrder,
  type OrderDetail,
  type OrderRow,
} from '../lib/orders';
import { printReceipt, type ReceiptDto } from '../lib/print';

const NEXT: Record<string, OrderStatus | null> = {
  confirmed: 'packed',
  packed: 'dispatched',
  dispatched: 'delivered',
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'confirmed', label: 'Pack' },
  { id: 'packed', label: 'Dispatch' },
  { id: 'dispatched', label: 'Out' },
] as const;
type Filter = (typeof FILTERS)[number]['id'];

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function Orders() {
  const online = useConnectivity();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [capturingItem, setCapturingItem] = useState<{ id: string; qty: number } | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(
    null,
  );

  const visible = useMemo(
    () => (filter === 'all' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter],
  );

  const refresh = useCallback(async () => {
    const list = await listOpenOrders();
    setOrders(list);
    setLoading(false);
    const id = selectedId ?? list[0]?.id ?? null;
    setSelectedId(id);
    setDetail(id ? await getOrderDetail(id) : null);
  }, [selectedId]);

  useEffect(() => {
    void refresh();
    // Load once on mount; later refreshes are explicit (after an action or the button).
  }, []);

  async function open(id: string) {
    setSelectedId(id);
    setMessage(null);
    setDetail(await getOrderDetail(id));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const i = visible.findIndex((o) => o.id === selectedId);
    if (e.key === 'j' && visible[i + 1]) void open(visible[i + 1].id);
    else if (e.key === 'k' && i > 0 && visible[i - 1]) void open(visible[i - 1].id);
  }

  async function advance() {
    if (!detail) return;
    const to = NEXT[detail.status];
    if (!to) return;
    setMessage(null);
    try {
      await transitionOrder(detail.id, detail.status as OrderStatus, to, online);
      setMessage(
        online
          ? { tone: 'ok', text: `Marked ${to}.` }
          : { tone: 'info', text: `Queued “${to}” — will sync when online.` },
      );
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Failed.' });
    }
  }

  async function saveSerials(serials: string[]) {
    if (!detail || !capturingItem) return;
    try {
      await captureSerials(detail.id, capturingItem.id, serials, online);
      setCapturingItem(null);
      setMessage(
        online
          ? { tone: 'ok', text: 'Serials captured.' }
          : { tone: 'info', text: 'Serials queued — will sync when online.' },
      );
      await refresh();
    } catch (err) {
      setMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Saving serials failed.',
      });
    }
  }

  async function print() {
    if (!detail) return;
    const dto: ReceiptDto = {
      header: 'ExtraMile Electronics',
      order_number: detail.order_number,
      lines: detail.items.map((i) => ({ name: i.title, qty: i.qty, line_total: '' })),
      total: formatGHS(detail.total),
      warranty: 'Warranty per product terms',
    };
    try {
      const path = await printReceipt(dto, 'Spool file (default)');
      setMessage({ tone: 'ok', text: `Receipt spooled: ${path}` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Print failed.' });
    }
  }

  const next = detail ? NEXT[detail.status] : null;
  const missingSerials = detail?.items.filter((it) => it.serials.length < it.qty).length ?? 0;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <PageHeader
        title="Orders"
        subtitle={`${orders.length} open · press j / k to move through the queue`}
        actions={
          <button type="button" className="btn-secondary" onClick={() => void refresh()}>
            <RefreshCw className="size-3.5" aria-hidden /> Refresh
          </button>
        }
      />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[20rem_1fr]">
        {/* Queue */}
        <section
          className="card flex min-h-0 flex-col overflow-hidden outline-none"
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          <div className="flex gap-1 border-b p-2">
            {FILTERS.map((f) => {
              const count =
                f.id === 'all' ? orders.length : orders.filter((o) => o.status === f.id).length;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    filter === f.id
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f.label} <span className="text-muted-foreground">{count}</span>
                </button>
              );
            })}
          </div>
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {loading ? (
              <li className="px-4 py-8 text-center text-muted-foreground">Loading…</li>
            ) : visible.length === 0 ? (
              <li>
                <EmptyState icon={Inbox} title="Queue is clear" body="No orders in this state." />
              </li>
            ) : (
              visible.map((o) => {
                const active = o.id === selectedId;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => void open(o.id)}
                      className={`flex w-full flex-col gap-1 border-l-2 px-4 py-3 text-left transition-colors ${
                        active
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent hover:bg-secondary/50'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{o.order_number}</span>
                        <span className="font-medium tabular-nums">{formatGHS(o.total)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">{o.email}</span>
                        <StatusBadge value={o.status} />
                      </span>
                      <span className="text-[11px] text-muted-foreground">{ago(o.created_at)}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        {/* Detail */}
        <section className="card min-h-0 overflow-y-auto">
          {!detail ? (
            <EmptyState
              icon={Inbox}
              title="No order selected"
              body="Pick an order from the queue to pack, scan serials and dispatch it."
            />
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
                <div>
                  <p className="text-lg font-semibold">{detail.order_number}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {detail.email} · {new Date(detail.created_at).toLocaleString()}
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <StatusBadge value={detail.status} />
                    <StatusBadge value={detail.payment_status} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-semibold tabular-nums">{formatGHS(detail.total)}</p>
                </div>
              </div>

              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="w-16 text-right">Qty</th>
                    <th>Serials / IMEI</th>
                    <th className="w-32" />
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((it) => {
                    const done = it.serials.length >= it.qty;
                    return (
                      <tr key={it.id}>
                        <td>
                          <p className="font-medium">{it.title}</p>
                          <p className="text-[11px] text-muted-foreground">SKU {it.sku}</p>
                        </td>
                        <td className="text-right tabular-nums">{it.qty}</td>
                        <td>
                          {it.serials.length > 0 ? (
                            <span className="font-mono text-xs">{it.serials.join(', ')}</span>
                          ) : (
                            <span className="text-xs text-amber-700">Not captured</span>
                          )}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className={done ? 'btn-ghost' : 'btn-secondary'}
                            onClick={() => setCapturingItem({ id: it.id, qty: it.qty })}
                          >
                            {done ? (
                              <Check className="size-3.5 text-success" aria-hidden />
                            ) : (
                              <ScanLine className="size-3.5" aria-hidden />
                            )}
                            {done ? 'Rescan' : 'Scan'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="space-y-3 border-t p-5">
                {missingSerials > 0 && next === 'packed' && (
                  <Notice tone="info">
                    {missingSerials} item{missingSerials === 1 ? '' : 's'} still need serials
                    scanned before packing.
                  </Notice>
                )}
                <div className="flex flex-wrap gap-2">
                  {next && (
                    <button
                      type="button"
                      className="btn-primary btn-lg"
                      onClick={() => void advance()}
                    >
                      <Check className="size-4" aria-hidden /> Mark {next}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secondary btn-lg"
                    onClick={() => void print()}
                  >
                    <Printer className="size-4" aria-hidden /> Print receipt
                  </button>
                </div>
                {message && <Notice tone={message.tone}>{message.text}</Notice>}
              </div>
            </div>
          )}
        </section>
      </div>

      {capturingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm">
          <div className="card w-full max-w-md shadow-xl">
            <div className="card-header">
              <h2 className="card-title">Scan serials</h2>
              <button
                type="button"
                className="btn-ghost h-7 w-7 px-0"
                aria-label="Close"
                onClick={() => setCapturingItem(null)}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="p-4">
              <SerialCapture count={capturingItem.qty} onComplete={(s) => void saveSerials(s)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
