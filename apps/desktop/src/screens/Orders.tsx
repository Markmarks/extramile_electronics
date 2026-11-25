import { formatGHS, type OrderStatus } from '@extramile/core';
import {
  Check,
  Inbox,
  MapPin,
  Phone,
  Printer,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { cedisInputToPesewas, Field, Modal, pesewasToInput } from '../components/Modal';
import { SerialCapture } from '../components/SerialCapture';
import { EmptyState, Notice, PageHeader, StatusBadge } from '../components/ui';
import { useConnectivity } from '../hooks/useConnectivity';
import {
  captureSerials,
  formatAddress,
  getOrderDetail,
  listOpenOrders,
  refundOrder,
  searchOrders,
  transitionOrder,
  type OrderDetail,
  type OrderRow,
} from '../lib/orders';
import { isPreview } from '../lib/preview';
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
  const { role: authRole } = useAuth();
  const isAdmin = (authRole ?? (isPreview ? 'admin' : null)) === 'admin';
  const [refunding, setRefunding] = useState(false);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<OrderRow[] | null>(null);
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
    () => found ?? (filter === 'all' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter, found],
  );

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setFound(search.trim() ? await searchOrders(search) : null);
  }

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
    // Thermal receipt in the brand voice (docs/brand §08). ESC/POS prints each line feed as
    // a new line, so the footer carries serials and warranty per item.
    const footer = [
      ...detail.items.flatMap((i) => [
        ...(i.serials.length ? [`${i.sku} IMEI/Serial ${i.serials.join(', ')}`] : []),
        ...(i.warranty_months > 0 ? [`${i.sku} ${i.warranty_months}-month warranty`] : []),
      ]),
      '',
      'Keep this receipt. It is your warranty record.',
      'ExtraMile Electronics, Accra',
    ].join('\n');
    const dto: ReceiptDto = {
      header: 'extramile',
      order_number: detail.order_number,
      lines: detail.items.map((i) => ({
        name: i.title,
        qty: i.qty,
        line_total: formatGHS(i.line_total),
      })),
      total: formatGHS(detail.total),
      warranty: footer,
    };
    try {
      const path = await printReceipt(dto, 'Spool file (default)');
      setMessage({ tone: 'ok', text: `Receipt spooled: ${path}` });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Print failed.' });
    }
  }

  async function doRefund(amount: number | null, reason: string, restock: boolean) {
    if (!detail) return;
    setMessage(null);
    try {
      const r = await refundOrder(detail.id, amount, reason, restock);
      setRefunding(false);
      setMessage({
        tone: 'ok',
        text: `Refunded ${formatGHS(r.refundAmount)}${r.full ? ' — order fully refunded' : ''}.`,
      });
      await refresh();
    } catch (err) {
      setRefunding(false);
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Refund failed.' });
    }
  }

  const canRefund =
    !!detail &&
    isAdmin &&
    (detail.payment_status === 'paid' || detail.payment_status === 'partially_refunded') &&
    detail.refundable > 0;
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
          <form className="relative border-b p-2" onSubmit={(e) => void runSearch(e)}>
            <Search
              className="pointer-events-none absolute left-4.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              className="input pl-8"
              placeholder="Find any order: number, email or phone"
              aria-label="Find an order"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (!e.target.value.trim()) setFound(null);
              }}
            />
          </form>
          {found && (
            <p className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
              {found.length} match{found.length === 1 ? '' : 'es'}, all statuses
              <button
                type="button"
                className="btn-ghost h-6 px-2 text-xs"
                onClick={() => {
                  setFound(null);
                  setSearch('');
                }}
              >
                Back to queue
              </button>
            </p>
          )}
          <div className={`flex gap-1 border-b p-2 ${found ? 'hidden' : ''}`}>
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

              {/* Delivery — where and to whom this goes */}
              <div className="grid gap-4 border-b p-5 sm:grid-cols-2">
                <div>
                  <p className="card-title mb-1.5 flex items-center gap-1.5">
                    <MapPin className="size-3.5" aria-hidden /> Deliver to
                  </p>
                  {formatAddress(detail.ship_to).length ? (
                    <address className="not-italic leading-relaxed">
                      {formatAddress(detail.ship_to).map((line, i) => (
                        <span key={i} className={`block ${i === 0 ? 'font-medium' : ''}`}>
                          {line}
                        </span>
                      ))}
                    </address>
                  ) : (
                    <p className="text-muted-foreground">No address recorded.</p>
                  )}
                  <p className="mt-1.5 flex items-center gap-1.5">
                    <Phone className="size-3.5 text-muted-foreground" aria-hidden />
                    <a
                      className="font-medium text-primary"
                      href={`tel:${detail.ship_to.phone ?? detail.phone}`}
                    >
                      {detail.ship_to.phone ?? detail.phone}
                    </a>
                    {detail.ship_to.phone && detail.ship_to.phone !== detail.phone && (
                      <span className="text-xs text-muted-foreground">(buyer {detail.phone})</span>
                    )}
                  </p>
                  {detail.notes && (
                    <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-[13px] text-warning">
                      Note: {detail.notes}
                    </p>
                  )}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                  <dt className="text-muted-foreground">Delivery zone</dt>
                  <dd className="text-right">
                    {detail.zone
                      ? `${detail.zone.name} · ${detail.zone.eta_days_min}–${detail.zone.eta_days_max} days`
                      : '—'}
                  </dd>
                  <dt className="text-muted-foreground">Items</dt>
                  <dd className="text-right tabular-nums">{formatGHS(detail.subtotal)}</dd>
                  <dt className="text-muted-foreground">Delivery fee</dt>
                  <dd className="text-right tabular-nums">
                    {detail.shipping_fee ? formatGHS(detail.shipping_fee) : 'Free'}
                  </dd>
                  {detail.discount > 0 && (
                    <>
                      <dt className="text-muted-foreground">
                        Discount{detail.coupon_code ? ` (${detail.coupon_code})` : ''}
                      </dt>
                      <dd className="text-right tabular-nums">−{formatGHS(detail.discount)}</dd>
                    </>
                  )}
                  <dt className="font-medium">Total</dt>
                  <dd className="text-right font-medium tabular-nums">{formatGHS(detail.total)}</dd>
                  {detail.refunds.map((r) => (
                    <div key={r.id} className="contents text-destructive">
                      <dt>
                        Refunded {new Date(r.created_at).toLocaleDateString()}
                        {r.reason ? ` · ${r.reason}` : ''}
                      </dt>
                      <dd className="text-right tabular-nums">−{formatGHS(r.amount)}</dd>
                    </div>
                  ))}
                </dl>
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
                          <p className="text-[11px] text-muted-foreground">
                            SKU {it.sku} · {formatGHS(it.unit_price)} each
                          </p>
                        </td>
                        <td className="text-right tabular-nums">{it.qty}</td>
                        <td>
                          {it.serials.length > 0 ? (
                            <span className="font-mono text-xs">{it.serials.join(', ')}</span>
                          ) : (
                            <span className="text-xs text-warning">Not captured</span>
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
                  {canRefund && (
                    <button
                      type="button"
                      className="btn-secondary btn-lg text-destructive"
                      onClick={() => setRefunding(true)}
                      disabled={!online}
                      title={online ? undefined : 'Refunds need a connection'}
                    >
                      <RotateCcw className="size-4" aria-hidden /> Refund…
                    </button>
                  )}
                </div>
                {message && <Notice tone={message.tone}>{message.text}</Notice>}
              </div>
            </div>
          )}
        </section>
      </div>

      {refunding && detail && (
        <Modal title={`Refund ${detail.order_number}`} onClose={() => setRefunding(false)}>
          <RefundForm
            refundable={detail.refundable}
            total={detail.total}
            onSubmit={(amount, reason, restock) => void doRefund(amount, reason, restock)}
          />
        </Modal>
      )}

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

function RefundForm({
  refundable,
  total,
  onSubmit,
}: {
  refundable: number;
  total: number;
  onSubmit: (amountPesewas: number | null, reason: string, restock: boolean) => void;
}) {
  const [full, setFull] = useState(true);
  const [amount, setAmount] = useState(pesewasToInput(refundable));
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const pesewas = full ? refundable : cedisInputToPesewas(amount);
  const valid =
    pesewas !== null && pesewas > 0 && pesewas <= refundable && reason.trim().length > 1;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        if (!confirm) return setConfirm(true);
        onSubmit(full ? null : pesewas, reason.trim(), restock);
      }}
    >
      <p className="text-muted-foreground">
        Order total {formatGHS(total)} · left to refund{' '}
        <span className="font-medium text-foreground">{formatGHS(refundable)}</span>. The money goes
        back to the customer through Paystack.
      </p>
      <div className="inline-flex rounded-lg border bg-secondary/50 p-0.5" role="radiogroup">
        {[
          { v: true, l: 'Everything left' },
          { v: false, l: 'Part of it' },
        ].map((o) => (
          <button
            key={o.l}
            type="button"
            role="radio"
            aria-checked={full === o.v}
            onClick={() => {
              setFull(o.v);
              setConfirm(false);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              full === o.v ? 'bg-card shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
      {!full && (
        <Field label="Amount (GH₵)" hint={`Up to ${formatGHS(refundable)}`}>
          <input
            className="input"
            type="number"
            min={0.01}
            step="0.01"
            max={refundable / 100}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setConfirm(false);
            }}
          />
        </Field>
      )}
      <Field label="Reason" hint="Kept with the refund; staff see it on the order.">
        <input
          className="input"
          placeholder="e.g. Faulty on arrival, customer returned it"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {(full || pesewas === refundable) && (
        <label className="flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={restock}
            onChange={(e) => setRestock(e.target.checked)}
          />
          <span>
            Put the items back in stock
            <span className="block text-[11px] text-muted-foreground">
              Untick if the customer keeps the goods (goodwill refund).
            </span>
          </span>
        </label>
      )}
      {confirm && valid && (
        <Notice tone="error">
          Refund {formatGHS(pesewas)} to the customer? This sends money and cannot be undone.
        </Notice>
      )}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={!valid}>
          {confirm ? `Yes, refund ${formatGHS(pesewas ?? 0)}` : 'Review refund'}
        </button>
      </div>
    </form>
  );
}
