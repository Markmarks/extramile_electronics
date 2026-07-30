import { formatGHS, type OrderStatus } from '@extramile/core';
import { useCallback, useEffect, useState } from 'react';
import { SerialCapture } from '../components/SerialCapture';
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

export function Orders() {
  const online = useConnectivity();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selected, setSelected] = useState(0);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [capturingItem, setCapturingItem] = useState<{ id: string; qty: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await listOpenOrders();
    setOrders(list);
    if (list[selected]) setDetail(await getOrderDetail(list[selected].id));
  }, [selected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = useCallback(
    async (i: number, list = orders) => {
      setSelected(i);
      const row = list[i];
      if (row) setDetail(await getOrderDetail(row.id));
    },
    [orders],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'j') void open(Math.min(selected + 1, orders.length - 1));
    else if (e.key === 'k') void open(Math.max(selected - 1, 0));
  }

  async function advance() {
    if (!detail) return;
    const to = NEXT[detail.status];
    if (!to) return;
    setMessage(null);
    try {
      await transitionOrder(detail.id, to, online);
      setMessage(online ? `Marked ${to}.` : `Queued "${to}" — will sync when online.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed.');
    }
  }

  async function saveSerials(serials: string[]) {
    if (!detail || !capturingItem) return;
    await captureSerials(detail.id, capturingItem.id, serials, online);
    setCapturingItem(null);
    setMessage('Serials captured.');
    await refresh();
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
      setMessage(`Receipt spooled: ${path}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Print failed.');
    }
  }

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: '18rem 1fr', gap: '1rem', padding: '1rem' }}
    >
      <div tabIndex={0} onKeyDown={onKeyDown} style={{ outline: 'none' }}>
        <p className="muted">Open orders ({orders.length}) — j/k to move</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {orders.map((o, i) => (
            <li key={o.id}>
              <button
                className="btn secondary"
                style={{
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 4,
                  borderColor: i === selected ? 'hsl(var(--primary))' : undefined,
                }}
                onClick={() => void open(i)}
              >
                {o.order_number} · {o.status}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        {!detail ? (
          <p className="muted">Select an order.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            <h2 style={{ margin: 0 }}>
              {detail.order_number}{' '}
              <span className="muted">
                · {detail.status} · {formatGHS(detail.total)}
              </span>
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {detail.items.map((it) => (
                <li
                  key={it.id}
                  style={{ borderBottom: '1px solid hsl(var(--border))', padding: '.5rem 0' }}
                >
                  <div>
                    {it.title} × {it.qty}
                  </div>
                  <div className="muted" style={{ fontSize: '.8rem' }}>
                    {it.serials.length > 0 ? it.serials.join(', ') : 'no serials yet'}
                  </div>
                  <button
                    className="btn secondary"
                    onClick={() => setCapturingItem({ id: it.id, qty: it.qty })}
                  >
                    Capture serials
                  </button>
                </li>
              ))}
            </ul>

            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              {NEXT[detail.status] && (
                <button className="btn" onClick={() => void advance()}>
                  Mark {NEXT[detail.status]}
                </button>
              )}
              <button className="btn secondary" onClick={() => void print()}>
                Print receipt
              </button>
            </div>
            {message && <p className="muted">{message}</p>}
          </div>
        )}
      </div>

      {capturingItem && (
        <div className="lock-overlay">
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', alignItems: 'center' }}
          >
            <SerialCapture count={capturingItem.qty} onComplete={(s) => void saveSerials(s)} />
            <button className="btn secondary" onClick={() => setCapturingItem(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
